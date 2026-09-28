import { createHash } from 'node:crypto';
import {
  buildHeadroom,
  buildNotices,
  lastEvent,
  noticeState,
  parseWarning,
  sortNotices,
  type AlertEvent,
  type ParsedWarning,
  type RotationSchedule,
  type StatusSnapshot,
} from '@gridwatch/core';
import type { Store } from './db.ts';
import { fanOut } from './fanout.ts';
import { log } from './log.ts';
import type { PushSender } from './push.ts';
import type { ElexonClient } from './sources/elexon.ts';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const SOURCES = {
  syswarn: { id: 'syswarn', label: 'NESO system warnings (Elexon BMRS)', critical: true },
  lolpdrm: { id: 'lolpdrm', label: 'Loss of load probability and de-rated margin (Elexon BMRS)', critical: false },
  freq: { id: 'freq', label: 'System frequency (Elexon BMRS)', critical: false },
} as const;

const NOTICE_SOURCE = { name: 'NESO system warnings via Elexon BMRS', url: 'https://bmrs.elexon.co.uk/' };

/** Events older than this when first seen are recorded but not pushed (e.g. on first start). */
const ALERTABLE_AGE = 2 * HOUR;

export class Ingestor {
  private running = new Set<string>();
  private timers: NodeJS.Timeout[] = [];

  private readonly store: Store;
  private readonly elexon: ElexonClient;
  private readonly sender: PushSender;
  private readonly clock: () => Date;

  constructor(store: Store, elexon: ElexonClient, sender: PushSender, clock: () => Date = () => new Date()) {
    this.store = store;
    this.elexon = elexon;
    this.sender = sender;
    this.clock = clock;
  }

  async ingestWarnings(): Promise<void> {
    const now = this.clock();
    await this.guard(SOURCES.syswarn, async () => {
      const { raw, records } = await this.elexon.systemWarnings(new Date(now.getTime() - 48 * HOUR), now);
      this.store.archive(SOURCES.syswarn.id, raw.url, raw.status, raw.body, now);
      const added = this.store.upsertWarnings(records);
      if (added > 0) log.info('new system warnings', { added });
    });
    await this.processNoticeEvents(now);
  }

  async ingestLossOfLoad(): Promise<void> {
    const now = this.clock();
    await this.guard(SOURCES.lolpdrm, async () => {
      const { raw, records } = await this.elexon.lossOfLoad(new Date(now.getTime() - HOUR), new Date(now.getTime() + 24 * HOUR));
      this.store.archive(SOURCES.lolpdrm.id, raw.url, raw.status, raw.body, now);
      this.store.upsertLolp(records);
    });
  }

  async ingestFrequency(): Promise<void> {
    const now = this.clock();
    await this.guard(SOURCES.freq, async () => {
      const { readings } = await this.elexon.frequency(new Date(now.getTime() - 10 * MINUTE), now);
      this.store.saveFrequency(readings.slice(-120));
    });
  }

  /** Push alerts for notice changes we haven't handled yet. */
  async processNoticeEvents(now: Date): Promise<void> {
    const notices = this.currentNotices(now, 7 * 24 * HOUR);
    for (const notice of notices) {
      for (const event of notice.history) {
        const key = `${notice.id}:${event.type}:${event.at}`;
        if (!this.store.markEventSeen(key, now)) continue;
        if (now.getTime() - new Date(event.at).getTime() > ALERTABLE_AGE) continue;
        const alertEvent: AlertEvent = { type: 'notice', change: event.type, notice };
        await fanOut(this.store, this.sender, alertEvent, key, now);
      }
    }
  }

  /** Publish or clear a rotation schedule (operator action) and alert subscribers. */
  async setRotation(schedule: RotationSchedule | null): Promise<void> {
    const now = this.clock();
    const previous = this.store.rotation();
    this.store.setRotation(schedule, now);
    const subject = schedule ?? previous;
    if (!subject) return;
    const change = !schedule ? 'cancelled' : previous && previous.announcedAt === schedule.announcedAt ? 'changed' : 'announced';
    const digest = createHash('sha256').update(JSON.stringify(schedule ?? {})).digest('hex').slice(0, 16);
    const key = `rotation:${subject.announcedAt}:${change}:${digest}`;
    if (!this.store.markEventSeen(key, now)) return;
    await fanOut(this.store, this.sender, { type: 'rotation', change, rotation: subject }, key, now);
  }

  snapshot(now: Date = this.clock()): StatusSnapshot {
    const notices = this.currentNotices(now, 7 * 24 * HOUR).filter((n) => {
      if (noticeState(n, now) === 'active') return true;
      const last = lastEvent(n);
      return !!last && now.getTime() - new Date(last.at).getTime() < 48 * HOUR;
    });
    const frequency = this.store.latestFrequency();
    const freshFrequency = frequency && now.getTime() - new Date(frequency.at).getTime() < 10 * MINUTE ? frequency : null;
    return {
      generatedAt: now.toISOString(),
      mode: 'live',
      notices: sortNotices(notices, now),
      headroom: buildHeadroom(this.store.lolpBetween(new Date(now.getTime() - 30 * MINUTE), new Date(now.getTime() + 24 * HOUR))),
      rotation: this.store.rotation(),
      frequency: freshFrequency,
      sources: this.store.sourceHealth().map((s) => {
        const known = Object.values(SOURCES).find((k) => k.id === s.id);
        return {
          id: s.id,
          label: s.label,
          ok: s.ok,
          critical: known?.critical ?? false,
          ...(s.lastSuccessAt ? { lastSuccessAt: s.lastSuccessAt } : {}),
          ...(s.lastAttemptAt ? { lastAttemptAt: s.lastAttemptAt } : {}),
        };
      }),
    };
  }

  notices(now: Date = this.clock(), days = 30) {
    return sortNotices(this.currentNotices(now, days * 24 * HOUR), now);
  }

  start(): void {
    const every = (ms: number, task: () => Promise<void>) => {
      const jitter = Math.floor(Math.random() * 5000);
      setTimeout(() => void task(), jitter);
      this.timers.push(setInterval(() => void task(), ms));
    };
    every(2 * MINUTE, () => this.ingestWarnings());
    every(15 * MINUTE, () => this.ingestLossOfLoad());
    every(1 * MINUTE, () => this.ingestFrequency());
    every(24 * HOUR, async () => this.store.prune(this.clock()));
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }

  private currentNotices(now: Date, lookbackMs: number) {
    // Ignore anything stamped more than a few minutes in the future (bad data or clock skew).
    const horizon = now.getTime() + 5 * MINUTE;
    const parsed = this.store
      .warningsSince(new Date(now.getTime() - lookbackMs))
      .map(parseWarning)
      .filter((w): w is ParsedWarning => w !== null && w.publishedAt.getTime() <= horizon);
    return buildNotices(parsed, NOTICE_SOURCE);
  }

  private async guard(source: { id: string; label: string }, task: () => Promise<void>): Promise<void> {
    if (this.running.has(source.id)) return;
    this.running.add(source.id);
    try {
      await task();
      this.store.recordAttempt(source.id, source.label, this.clock(), null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.store.recordAttempt(source.id, source.label, this.clock(), message);
      log.warn('ingest failed', { source: source.id, error: message });
    } finally {
      this.running.delete(source.id);
    }
  }
}
