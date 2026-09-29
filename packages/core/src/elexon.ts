import type { RawLolpRecord } from './headroom.ts';
import type { RawSystemWarning } from './notices.ts';
import type { FrequencyReading } from './types.ts';

/**
 * Elexon Insights Solution (BMRS) API: free, open licence, attribution needed.
 * Used by the API server and, in the native app, directly by the device (the
 * API sends `Access-Control-Allow-Origin: *`).
 *
 * Checked against the live service on 29 September 2026, including every
 * system warning since May 2023 (see services/api/test/fixtures).
 */
export const ELEXON_BASE = 'https://data.elexon.co.uk/bmrs/api/v1';

export const ELEXON_PATHS = {
  /** Query: publishDateTimeFrom, publishDateTimeTo. */
  systemWarnings: '/datasets/SYSWARN',
  /** Query: from, to (both required). Forecasts at 1, 2, 4, 8 and 12 hours ahead. */
  lossOfLoad: '/forecast/system/loss-of-load',
  /** Query: from, to. One reading every 15 seconds. */
  frequency: '/system/frequency',
} as const;

export const ELEXON_ATTRIBUTION = 'Contains BMRS data © Elexon Limited copyright and database right 2026.';

export function elexonUrl(base: string, path: string, params: Record<string, string>): string {
  const query = Object.entries({ ...params, format: 'json' })
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  return `${base.replace(/\/$/, '')}${path}?${query}`;
}

/** The requests a live client makes, relative to `now`. Shared so the server and the device ask for the same windows. */
export function elexonRequests(base: string, now: Date, warningsLookbackMs: number) {
  const iso = (ms: number) => new Date(now.getTime() + ms).toISOString();
  const MINUTE = 60_000;
  return {
    systemWarnings: elexonUrl(base, ELEXON_PATHS.systemWarnings, {
      publishDateTimeFrom: iso(-warningsLookbackMs),
      publishDateTimeTo: iso(5 * MINUTE),
    }),
    lossOfLoad: elexonUrl(base, ELEXON_PATHS.lossOfLoad, { from: iso(-60 * MINUTE), to: iso(24 * 60 * MINUTE) }),
    frequency: elexonUrl(base, ELEXON_PATHS.frequency, { from: iso(-10 * MINUTE), to: now.toISOString() }),
  };
}

/** The feed answered, but not in the shape we know. Surfaces in source health rather than being guessed around. */
export class FeedFormatError extends Error {}

type Row = Record<string, unknown>;

function rows(json: unknown, feed: string): Row[] {
  const data = Array.isArray(json) ? json : (json as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) throw new FeedFormatError(`${feed}: expected a data array`);
  return data.filter((r): r is Row => !!r && typeof r === 'object');
}

/** Keep the valid rows; if there were rows and none were valid, the format has changed. */
function mapRows<T>(json: unknown, feed: string, map: (row: Row) => T | null): T[] {
  const input = rows(json, feed);
  const out: T[] = [];
  for (const row of input) {
    const value = map(row);
    if (value !== null) out.push(value);
  }
  if (input.length > 0 && out.length === 0) throw new FeedFormatError(`${feed}: no rows in the expected format`);
  return out;
}

const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.length <= max ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const isDate = (v: string | undefined): v is string => !!v && !Number.isNaN(new Date(v).getTime());

export function parseSystemWarnings(json: unknown): RawSystemWarning[] {
  return mapRows(json, 'SYSWARN', (row) => {
    const publishTime = str(row.publishTime, 40);
    const warningText = str(row.warningText, 20_000);
    if (!isDate(publishTime) || warningText === undefined) return null;
    const out: RawSystemWarning = { publishTime, warningText };
    const warningType = str(row.warningType, 200);
    if (warningType) out.warningType = warningType;
    return out;
  });
}

export function parseLossOfLoad(json: unknown): RawLolpRecord[] {
  return mapRows(json, 'LOLPDRM', (row) => {
    const out: RawLolpRecord = {};
    const publishTime = str(row.publishTime, 40);
    const startTime = str(row.startTime, 40);
    const settlementDate = str(row.settlementDate, 20);
    if (isDate(publishTime)) out.publishTime = publishTime;
    if (isDate(startTime)) out.startTime = startTime;
    if (settlementDate) out.settlementDate = settlementDate;
    const period = num(row.settlementPeriod);
    if (period !== undefined && Number.isInteger(period) && period >= 1 && period <= 50) out.settlementPeriod = period;
    const horizon = num(row.forecastHorizon);
    if (horizon !== undefined) out.forecastHorizon = horizon;
    const lolp = num(row.lossOfLoadProbability) ?? num(row.lolp);
    const margin = num(row.deratedMargin) ?? num(row.deRatedMargin);
    if (lolp === undefined || margin === undefined) return null;
    out.lossOfLoadProbability = lolp;
    out.deratedMargin = margin;
    return out;
  });
}

export function parseFrequency(json: unknown): FrequencyReading[] {
  return mapRows(json, 'FREQ', (row) => {
    const at = str(row.measurementTime, 40);
    const hz = num(row.frequency);
    if (!isDate(at) || hz === undefined || hz < 40 || hz > 60) return null;
    return { at: new Date(at).toISOString(), hz };
  }).toSorted((a, b) => a.at.localeCompare(b.at));
}
