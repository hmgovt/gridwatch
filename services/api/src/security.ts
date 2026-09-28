import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** 256-bit random bearer token, shown to the client once. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** We store only a hash of each token, so a database leak doesn't leak working tokens. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function tokenMatches(token: string, expectedHash: string): boolean {
  const a = Buffer.from(hashToken(token), 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function bearer(header: string | undefined): string | null {
  const match = /^Bearer ([A-Za-z0-9_-]{16,128})$/.exec(header ?? '');
  return match?.[1] ?? null;
}

/**
 * Fixed-window rate limiter held in memory. Keys are salted hashes, never raw
 * IP addresses, and the salt changes on every restart. For multiple instances
 * use the hosting platform's rate limiting as well.
 */
export class RateLimiter {
  private readonly salt = randomBytes(16);
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  private readonly limit: number;
  private readonly windowMs: number;

  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  allow(rawKey: string, now = Date.now()): boolean {
    const key = createHash('sha256').update(this.salt).update(rawKey).digest('base64url');
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      if (this.hits.size > 50_000) this.sweep(now);
      return true;
    }
    entry.count++;
    return entry.count <= this.limit;
  }

  private sweep(now: number): void {
    for (const [key, entry] of this.hits) if (entry.resetAt <= now) this.hits.delete(key);
  }
}
