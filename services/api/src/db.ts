import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gzipSync } from 'node:zlib';
import type { RawLolpRecord, RawSystemWarning, RotationSchedule, Sensitivity } from '@gridwatch/core';

/**
 * Storage on SQLite (Node's built-in driver). Every query is parameterised.
 * The same schema runs on Cloudflare D1 or any SQLite host if the API moves.
 */

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS raw_fetches (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     source TEXT NOT NULL,
     fetched_at TEXT NOT NULL,
     url TEXT NOT NULL,
     status INTEGER NOT NULL,
     sha256 TEXT NOT NULL,
     body_gzip BLOB NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS raw_fetches_source ON raw_fetches (source, fetched_at)`,
  `CREATE TABLE IF NOT EXISTS warnings (
     publish_time TEXT NOT NULL,
     warning_type TEXT NOT NULL DEFAULT '',
     warning_text TEXT NOT NULL,
     PRIMARY KEY (publish_time, warning_text)
   )`,
  `CREATE TABLE IF NOT EXISTS lolp (
     start_time TEXT NOT NULL,
     publish_time TEXT NOT NULL,
     horizon INTEGER NOT NULL,
     settlement_period INTEGER NOT NULL,
     lolp REAL NOT NULL,
     derated_margin REAL NOT NULL,
     PRIMARY KEY (start_time, publish_time, horizon)
   )`,
  `CREATE TABLE IF NOT EXISTS frequency (at TEXT PRIMARY KEY, hz REAL NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS source_health (
     id TEXT PRIMARY KEY,
     label TEXT NOT NULL,
     last_success_at TEXT,
     last_attempt_at TEXT,
     ok INTEGER NOT NULL DEFAULT 0,
     last_error TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS rotation (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS subscriptions (
     id TEXT PRIMARY KEY,
     token_hash TEXT NOT NULL,
     channel TEXT NOT NULL,
     endpoint TEXT NOT NULL UNIQUE,
     p256dh TEXT NOT NULL,
     auth TEXT NOT NULL,
     rota_letter TEXT,
     sensitivity TEXT NOT NULL,
     created_at TEXT NOT NULL,
     last_seen_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS deliveries (
     subscription_id TEXT NOT NULL,
     alert_key TEXT NOT NULL,
     sent_at TEXT NOT NULL,
     PRIMARY KEY (subscription_id, alert_key)
   )`,
  `CREATE TABLE IF NOT EXISTS alert_log (event_key TEXT PRIMARY KEY, seen_at TEXT NOT NULL)`,
];

export interface SubscriptionRow {
  id: string;
  tokenHash: string;
  channel: 'webpush';
  endpoint: string;
  p256dh: string;
  auth: string;
  rotaLetter: string | null;
  sensitivity: Sensitivity;
  createdAt: string;
  lastSeenAt: string;
}

export interface SourceHealthRow {
  id: string;
  label: string;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  ok: boolean;
  lastError: string | null;
}

type Row = Record<string, unknown>;

export class Store {
  readonly db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    for (const sql of MIGRATIONS) this.db.exec(sql);
  }

  close(): void {
    this.db.close();
  }

  // --- raw archive -------------------------------------------------------

  /** Keep every distinct response body, compressed. Returns false if unchanged since last fetch. */
  archive(source: string, url: string, status: number, body: string, fetchedAt: Date): boolean {
    const sha256 = createHash('sha256').update(body).digest('hex');
    const last = this.db
      .prepare('SELECT sha256 FROM raw_fetches WHERE source = ? ORDER BY id DESC LIMIT 1')
      .get(source) as Row | undefined;
    if (last?.sha256 === sha256) return false;
    this.db
      .prepare('INSERT INTO raw_fetches (source, fetched_at, url, status, sha256, body_gzip) VALUES (?, ?, ?, ?, ?, ?)')
      .run(source, fetchedAt.toISOString(), url, status, sha256, gzipSync(body));
    return true;
  }

  // --- system warnings ---------------------------------------------------

  upsertWarnings(records: RawSystemWarning[]): number {
    const insert = this.db.prepare(
      'INSERT OR IGNORE INTO warnings (publish_time, warning_type, warning_text) VALUES (?, ?, ?)',
    );
    let added = 0;
    for (const r of records) added += Number(insert.run(r.publishTime, r.warningType ?? '', r.warningText).changes);
    return added;
  }

  warningsSince(since: Date): RawSystemWarning[] {
    const rows = this.db
      .prepare('SELECT publish_time, warning_type, warning_text FROM warnings WHERE publish_time >= ? ORDER BY publish_time')
      .all(since.toISOString()) as Row[];
    return rows.map((r) => ({
      publishTime: String(r.publish_time),
      warningType: String(r.warning_type),
      warningText: String(r.warning_text),
    }));
  }

  // --- loss of load probability / de-rated margin -------------------------

  upsertLolp(records: RawLolpRecord[]): number {
    const insert = this.db.prepare(
      `INSERT OR REPLACE INTO lolp (start_time, publish_time, horizon, settlement_period, lolp, derated_margin)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    let n = 0;
    for (const r of records) {
      const lolp = r.lossOfLoadProbability ?? r.lolp;
      const margin = r.deratedMargin ?? r.deRatedMargin;
      if (!r.startTime || !r.publishTime || typeof lolp !== 'number' || typeof margin !== 'number') continue;
      insert.run(r.startTime, r.publishTime, r.forecastHorizon ?? 0, r.settlementPeriod ?? 0, lolp, margin);
      n++;
    }
    return n;
  }

  lolpBetween(from: Date, to: Date): RawLolpRecord[] {
    const rows = this.db
      .prepare(
        `SELECT start_time, publish_time, horizon, settlement_period, lolp, derated_margin FROM lolp
         WHERE start_time >= ? AND start_time < ? ORDER BY start_time`,
      )
      .all(from.toISOString(), to.toISOString()) as Row[];
    return rows.map((r) => ({
      startTime: String(r.start_time),
      publishTime: String(r.publish_time),
      forecastHorizon: Number(r.horizon),
      settlementPeriod: Number(r.settlement_period),
      lossOfLoadProbability: Number(r.lolp),
      deratedMargin: Number(r.derated_margin),
    }));
  }

  // --- frequency ---------------------------------------------------------

  saveFrequency(readings: Array<{ at: string; hz: number }>): void {
    const insert = this.db.prepare('INSERT OR REPLACE INTO frequency (at, hz) VALUES (?, ?)');
    for (const r of readings) insert.run(r.at, r.hz);
  }

  latestFrequency(): { at: string; hz: number } | null {
    const row = this.db.prepare('SELECT at, hz FROM frequency ORDER BY at DESC LIMIT 1').get() as Row | undefined;
    return row ? { at: String(row.at), hz: Number(row.hz) } : null;
  }

  /** Readings since a moment, oldest first. */
  frequencySince(since: Date): Array<{ at: string; hz: number }> {
    const rows = this.db.prepare('SELECT at, hz FROM frequency WHERE at >= ? ORDER BY at').all(since.toISOString()) as Row[];
    return rows.map((r) => ({ at: String(r.at), hz: Number(r.hz) }));
  }

  // --- source health -----------------------------------------------------

  recordAttempt(id: string, label: string, at: Date, error: string | null): void {
    const iso = at.toISOString();
    this.db
      .prepare(
        `INSERT INTO source_health (id, label, last_success_at, last_attempt_at, ok, last_error)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           label = excluded.label,
           last_attempt_at = excluded.last_attempt_at,
           last_success_at = COALESCE(excluded.last_success_at, source_health.last_success_at),
           ok = excluded.ok,
           last_error = excluded.last_error`,
      )
      .run(id, label, error ? null : iso, iso, error ? 0 : 1, error ? error.slice(0, 300) : null);
  }

  sourceHealth(): SourceHealthRow[] {
    const rows = this.db.prepare('SELECT * FROM source_health ORDER BY id').all() as Row[];
    return rows.map((r) => ({
      id: String(r.id),
      label: String(r.label),
      lastSuccessAt: r.last_success_at ? String(r.last_success_at) : null,
      lastAttemptAt: r.last_attempt_at ? String(r.last_attempt_at) : null,
      ok: Number(r.ok) === 1,
      lastError: r.last_error ? String(r.last_error) : null,
    }));
  }

  // --- rotation schedule -------------------------------------------------

  rotation(): RotationSchedule | null {
    const row = this.db.prepare('SELECT json FROM rotation WHERE id = 1').get() as Row | undefined;
    return row ? (JSON.parse(String(row.json)) as RotationSchedule) : null;
  }

  setRotation(schedule: RotationSchedule | null, at: Date): void {
    if (!schedule) {
      this.db.prepare('DELETE FROM rotation WHERE id = 1').run();
      return;
    }
    this.db
      .prepare('INSERT OR REPLACE INTO rotation (id, json, updated_at) VALUES (1, ?, ?)')
      .run(JSON.stringify(schedule), at.toISOString());
  }

  // --- push subscriptions ------------------------------------------------

  upsertSubscription(row: SubscriptionRow): void {
    this.db
      .prepare(
        `INSERT INTO subscriptions (id, token_hash, channel, endpoint, p256dh, auth, rota_letter, sensitivity, created_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (endpoint) DO UPDATE SET
           id = excluded.id, token_hash = excluded.token_hash, p256dh = excluded.p256dh, auth = excluded.auth,
           rota_letter = excluded.rota_letter, sensitivity = excluded.sensitivity, last_seen_at = excluded.last_seen_at`,
      )
      .run(
        row.id,
        row.tokenHash,
        row.channel,
        row.endpoint,
        row.p256dh,
        row.auth,
        row.rotaLetter,
        row.sensitivity,
        row.createdAt,
        row.lastSeenAt,
      );
  }

  subscription(id: string): SubscriptionRow | null {
    const row = this.db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(id) as Row | undefined;
    return row ? toSubscription(row) : null;
  }

  updateSubscriptionPrefs(id: string, rotaLetter: string | null, sensitivity: Sensitivity, seenAt: Date): void {
    this.db
      .prepare('UPDATE subscriptions SET rota_letter = ?, sensitivity = ?, last_seen_at = ? WHERE id = ?')
      .run(rotaLetter, sensitivity, seenAt.toISOString(), id);
  }

  deleteSubscription(id: string): void {
    this.db.prepare('DELETE FROM deliveries WHERE subscription_id = ?').run(id);
    this.db.prepare('DELETE FROM subscriptions WHERE id = ?').run(id);
  }

  *allSubscriptions(batch = 500): Generator<SubscriptionRow> {
    let after = '';
    for (;;) {
      const rows = this.db
        .prepare('SELECT * FROM subscriptions WHERE id > ? ORDER BY id LIMIT ?')
        .all(after, batch) as Row[];
      if (rows.length === 0) return;
      for (const row of rows) yield toSubscription(row);
      after = String(rows[rows.length - 1]!.id);
    }
  }

  // --- alert bookkeeping --------------------------------------------------

  /** Returns true the first time a delivery key is claimed for a subscription. */
  claimDelivery(subscriptionId: string, alertKey: string, at: Date): boolean {
    const result = this.db
      .prepare('INSERT OR IGNORE INTO deliveries (subscription_id, alert_key, sent_at) VALUES (?, ?, ?)')
      .run(subscriptionId, alertKey, at.toISOString());
    return Number(result.changes) === 1;
  }

  /** Returns true the first time an event key is seen. */
  markEventSeen(eventKey: string, at: Date): boolean {
    const result = this.db
      .prepare('INSERT OR IGNORE INTO alert_log (event_key, seen_at) VALUES (?, ?)')
      .run(eventKey, at.toISOString());
    return Number(result.changes) === 1;
  }

  // --- retention ---------------------------------------------------------

  /** Delete what we no longer need. See docs/PRIVACY.md for the schedule. */
  prune(now: Date): void {
    const day = 86_400_000;
    const iso = (ms: number) => new Date(now.getTime() - ms).toISOString();
    const stale = this.db.prepare('SELECT id FROM subscriptions WHERE last_seen_at < ?').all(iso(180 * day)) as Row[];
    for (const row of stale) this.deleteSubscription(String(row.id));
    this.db.prepare('DELETE FROM deliveries WHERE sent_at < ?').run(iso(30 * day));
    this.db.prepare('DELETE FROM frequency WHERE at < ?').run(iso(2 * day));
    this.db.prepare('DELETE FROM alert_log WHERE seen_at < ?').run(iso(90 * day));
  }
}

function toSubscription(r: Row): SubscriptionRow {
  return {
    id: String(r.id),
    tokenHash: String(r.token_hash),
    channel: 'webpush',
    endpoint: String(r.endpoint),
    p256dh: String(r.p256dh),
    auth: String(r.auth),
    rotaLetter: r.rota_letter ? String(r.rota_letter) : null,
    sensitivity: String(r.sensitivity) as Sensitivity,
    createdAt: String(r.created_at),
    lastSeenAt: String(r.last_seen_at),
  };
}
