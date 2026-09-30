/**
 * The Worker's only state: which notice events have been handled, plus a few
 * small values (health, the cached Firebase access token, archive hashes).
 * No personal data: alerts go to Firebase topics, not to stored devices.
 */
export interface StateStore {
  /** Claim a key before acting on it. True if this call claimed it; false if it was already claimed. */
  claim(key: string, at: Date): Promise<boolean>;
  /** Give a claim back after a failed action, so the next run retries. */
  release(key: string): Promise<void>;
  get<T>(key: string): Promise<T | null>;
  put(key: string, value: unknown): Promise<void>;
  /** Drop claims older than `before`. */
  prune(before: Date): Promise<void>;
}

export class D1Store implements StateStore {
  private readonly db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async claim(key: string, at: Date): Promise<boolean> {
    const result = await this.db.prepare('INSERT OR IGNORE INTO claims (key, at) VALUES (?, ?)').bind(key, at.toISOString()).run();
    return result.meta.changes === 1;
  }

  async release(key: string): Promise<void> {
    await this.db.prepare('DELETE FROM claims WHERE key = ?').bind(key).run();
  }

  async get<T>(key: string): Promise<T | null> {
    const row = await this.db.prepare('SELECT value FROM state WHERE key = ?').bind(key).first<{ value: string }>();
    return row ? (JSON.parse(row.value) as T) : null;
  }

  async put(key: string, value: unknown): Promise<void> {
    await this.db
      .prepare('INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .bind(key, JSON.stringify(value))
      .run();
  }

  async prune(before: Date): Promise<void> {
    await this.db.prepare('DELETE FROM claims WHERE at < ?').bind(before.toISOString()).run();
  }
}

/** For tests and local runs. */
export class MemoryStore implements StateStore {
  readonly claims = new Map<string, string>();
  readonly state = new Map<string, string>();

  async claim(key: string, at: Date): Promise<boolean> {
    if (this.claims.has(key)) return false;
    this.claims.set(key, at.toISOString());
    return true;
  }

  async release(key: string): Promise<void> {
    this.claims.delete(key);
  }

  async get<T>(key: string): Promise<T | null> {
    const value = this.state.get(key);
    return value === undefined ? null : (JSON.parse(value) as T);
  }

  async put(key: string, value: unknown): Promise<void> {
    this.state.set(key, JSON.stringify(value));
  }

  async prune(before: Date): Promise<void> {
    for (const [key, at] of this.claims) if (at < before.toISOString()) this.claims.delete(key);
  }
}
