import {
  activeNotices,
  durations,
  ELEXON_BASE,
  elexonRequests,
  NOTICE_LOOKBACK_MS,
  noticeBroadcast,
  noticeCard,
  noticesFrom,
  parseSystemWarnings,
  shareText,
  type Notice,
  type NoticeEvent,
} from '@gridwatch/core';
import type { PushSender } from './fcm.ts';
import { getJson, request, sha256Hex, type Fetch } from './http.ts';
import type { Poster } from './social.ts';
import type { StateStore } from './store.ts';

/** Events first seen later than this (the service was down, or just deployed) are recorded but not sent. */
const ALERTABLE_AGE = 2 * durations.HOUR;
/** /health reports unhealthy if the last good check is older than this. */
export const STALE_AFTER = 10 * durations.MINUTE;
const CLAIM_RETENTION = 30 * durations.DAY;

export interface CheckDeps {
  fetch: Fetch;
  store: StateStore;
  push: PushSender | null;
  posters: Poster[];
  siteUrl: string;
  elexonBase?: string;
  /** Raw responses, for later analysis. Written only when the content changes. */
  archive?: { put(key: string, body: string): Promise<unknown> };
  /** Pinged after every good check, so a missed ping raises the alarm (e.g. healthchecks.io). */
  heartbeatUrl?: string;
}

export interface Health {
  lastRunAt: string;
  lastSuccessAt?: string;
  lastError?: string;
  noticesInForce?: number;
  lastSent?: { key: string; at: string; channels: string[] };
}

export interface CheckReport {
  ok: boolean;
  sent: Array<{ key: string; channel: string }>;
  failed: Array<{ key: string; channel: string; error: string }>;
}

/** One minute's work: read NESO's warnings, and act once on each new notice event. */
export async function runCheck(deps: CheckDeps, now: Date): Promise<CheckReport> {
  const report: CheckReport = { ok: false, sent: [], failed: [] };
  const health: Health = { ...(await deps.store.get<Health>('health')), lastRunAt: now.toISOString() };

  let notices: Notice[];
  try {
    const url = elexonRequests(deps.elexonBase ?? ELEXON_BASE, now, NOTICE_LOOKBACK_MS).systemWarnings;
    const { body, json } = await getJson(deps.fetch, url);
    notices = noticesFrom(parseSystemWarnings(json), now);
    await archive(deps, body, now);
  } catch (error) {
    health.lastError = `${now.toISOString()} ${error instanceof Error ? error.message : String(error)}`;
    await deps.store.put('health', health);
    return report;
  }

  for (const notice of notices) {
    for (const [index, event] of notice.history.entries()) {
      if (now.getTime() - new Date(event.at).getTime() > ALERTABLE_AGE) continue;
      const asOf = noticeAt(notice, index);
      const key = `${notice.id}:${event.type}:${event.at}`;

      if (deps.push) {
        const broadcast = noticeBroadcast({ type: 'notice', change: event.type, notice: asOf }, now);
        if (broadcast) {
          await once(deps.store, `push:${key}`, now, report, 'push', () =>
            deps.push!.broadcast(broadcast.alert, broadcast.audience, event.type),
          );
        }
      }

      const card = noticeCard(asOf, event.type, now);
      const text = shareText(card, deps.siteUrl);
      const link = {
        url: `${deps.siteUrl.replace(/\/$/, '')}${card.path}`,
        title: `${card.eyebrow}: ${card.headline}`,
        description: `${card.meaning} ${card.action}`,
      };
      for (const poster of deps.posters) {
        await once(deps.store, `post:${poster.id}:${key}`, now, report, poster.id, () => poster.post(text, link, key));
      }
    }
  }

  report.ok = true;
  health.lastSuccessAt = now.toISOString();
  health.noticesInForce = activeNotices(notices, now).length;
  delete health.lastError;
  const sentNow = report.sent;
  if (sentNow.length > 0) {
    health.lastSent = { key: sentNow[0]!.key, at: now.toISOString(), channels: [...new Set(sentNow.map((s) => s.channel))] };
  }
  await deps.store.put('health', health);

  // Housekeeping once a day, and the heartbeat after every good check.
  if (now.getUTCHours() === 3 && now.getUTCMinutes() === 17) await deps.store.prune(new Date(now.getTime() - CLAIM_RETENTION));
  if (deps.heartbeatUrl) await request(deps.fetch, deps.heartbeatUrl, { method: 'GET' }, 5000).catch(() => undefined);
  return report;
}

/** Do `action` at most once per key. A failure gives the claim back so the next run retries. */
async function once(store: StateStore, key: string, now: Date, report: CheckReport, channel: string, action: () => Promise<void>) {
  if (!(await store.claim(key, now))) return;
  try {
    await action();
    report.sent.push({ key, channel });
  } catch (error) {
    await store.release(key);
    report.failed.push({ key, channel, error: error instanceof Error ? error.message : String(error) });
  }
}

/** The notice as it stood right after its `index`th message, so each alert quotes the figures of its moment. */
export function noticeAt(notice: Notice, index: number): Notice {
  const history = notice.history.slice(0, index + 1);
  const event = history[index] as NoticeEvent;
  let window = notice.window;
  let shortfallMW: number | undefined;
  for (const e of history) {
    if (e.type === 'cancelled') continue;
    if (e.window) window = e.window;
    if (e.shortfallMW !== undefined) shortfallMW = e.shortfallMW;
  }
  const at: Notice = { ...notice, history, cancelled: event.type === 'cancelled' };
  if (window) at.window = window;
  if (shortfallMW !== undefined) at.shortfallMW = shortfallMW;
  else delete at.shortfallMW;
  return at;
}

async function archive(deps: CheckDeps, body: string, now: Date): Promise<void> {
  if (!deps.archive) return;
  const hash = await sha256Hex(body);
  if ((await deps.store.get<string>('archive:syswarn')) === hash) return;
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  await deps.archive.put(`syswarn/${stamp.slice(0, 4)}/${stamp.slice(4, 8)}/${stamp}-${hash.slice(0, 12)}.json`, body);
  await deps.store.put('archive:syswarn', hash);
}

