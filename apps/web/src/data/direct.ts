import {
  buildLiveSnapshot,
  ELEXON_BASE,
  elexonRequests,
  LIVE_SOURCES,
  NOTICE_LOOKBACK_MS,
  parseFrequency,
  parseLossOfLoad,
  parseSystemWarnings,
  type FrequencyReading,
  type RawLolpRecord,
  type RawSystemWarning,
  type SourceHealth,
  type StatusSnapshot,
} from '@gridwatch/core';
import { platform } from '../platform/index.ts';

/**
 * Direct mode: the device reads Elexon's public API itself and builds the same
 * status document the server would, with the same code. Used by the native app
 * so it works without our server. Only public, anonymous requests are made;
 * nothing about the user is sent.
 */

const MAX_BYTES = 2 * 1024 * 1024;
const CACHE_KEY = 'direct.feeds.v1';

interface FeedCache {
  warnings: RawSystemWarning[];
  lossOfLoad: RawLolpRecord[];
  frequency: FrequencyReading[];
  health: Record<string, { lastSuccessAt?: string; lastAttemptAt?: string; ok: boolean }>;
}

const EMPTY: FeedCache = { warnings: [], lossOfLoad: [], frequency: [], health: {} };

async function getJson(url: string): Promise<unknown> {
  if (!url.startsWith('https://')) throw new Error('Refusing a non-HTTPS feed');
  const response = await fetch(url, {
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!(response.headers.get('content-type') ?? '').includes('json')) throw new Error('Unexpected content type');
  const text = await response.text();
  if (text.length > MAX_BYTES) throw new Error('Response too large');
  return JSON.parse(text) as unknown;
}

/** Fetch all three feeds; a failing feed keeps its last good data and is marked unhealthy. */
export async function fetchDirectSnapshot(now = new Date()): Promise<StatusSnapshot> {
  const cache = platform.storage.get<FeedCache>(CACHE_KEY, EMPTY);
  const urls = elexonRequests(ELEXON_BASE, now, NOTICE_LOOKBACK_MS);
  const at = now.toISOString();

  /** Fetch one feed unless it succeeded within `minIntervalMs` (the forecast only changes every half-hour). */
  const attempt = async <T,>(id: string, run: () => Promise<T>, keep: (value: T) => void, minIntervalMs = 0) => {
    const previous = cache.health[id];
    const last = previous?.ok && previous.lastSuccessAt ? new Date(previous.lastSuccessAt).getTime() : 0;
    if (now.getTime() - last < minIntervalMs) return;
    try {
      keep(await run());
      cache.health[id] = { ok: true, lastSuccessAt: at, lastAttemptAt: at };
    } catch {
      cache.health[id] = { ...previous, ok: false, lastAttemptAt: at };
    }
  };

  await Promise.all([
    attempt(LIVE_SOURCES.syswarn.id, async () => parseSystemWarnings(await getJson(urls.systemWarnings)), (v) => (cache.warnings = v)),
    attempt(LIVE_SOURCES.lolpdrm.id, async () => parseLossOfLoad(await getJson(urls.lossOfLoad)), (v) => (cache.lossOfLoad = v), 10 * 60_000),
    attempt(LIVE_SOURCES.freq.id, async () => parseFrequency(await getJson(urls.frequency)), (v) => (cache.frequency = v)),
  ]);
  platform.storage.set(CACHE_KEY, cache);

  const sources: SourceHealth[] = Object.values(LIVE_SOURCES).map((s) => ({
    id: s.id,
    label: s.label,
    critical: s.critical,
    ok: cache.health[s.id]?.ok ?? false,
    ...(cache.health[s.id]?.lastSuccessAt ? { lastSuccessAt: cache.health[s.id]!.lastSuccessAt! } : {}),
    ...(cache.health[s.id]?.lastAttemptAt ? { lastAttemptAt: cache.health[s.id]!.lastAttemptAt! } : {}),
  }));

  if (!sources.some((s) => s.lastSuccessAt)) throw new Error('Can’t reach Elexon. Check your connection.');
  return buildLiveSnapshot(
    { warnings: cache.warnings, lossOfLoad: cache.lossOfLoad, frequency: cache.frequency, rotation: null, sources },
    now,
  );
}
