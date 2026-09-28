import { atUkTime, durations } from './time.ts';
import type { HeadroomPoint } from './types.ts';

/**
 * A loss-of-load probability / de-rated margin forecast row as published
 * (Elexon BMRS dataset LOLPDRM). Field names vary slightly between endpoints,
 * so the common alternatives are accepted.
 */
export interface RawLolpRecord {
  publishTime?: string;
  settlementDate?: string;
  settlementPeriod?: number;
  startTime?: string;
  forecastHorizon?: number;
  lossOfLoadProbability?: number;
  lolp?: number;
  deratedMargin?: number;
  deRatedMargin?: number;
}

/**
 * Reduce raw forecast rows to one point per settlement period, keeping the most
 * recently published forecast for each (the shortest horizon wins a tie).
 */
export function buildHeadroom(records: RawLolpRecord[]): HeadroomPoint[] {
  const best = new Map<string, { point: HeadroomPoint; published: number }>();
  for (const record of records) {
    const point = toPoint(record);
    if (!point) continue;
    const published = record.publishTime ? new Date(record.publishTime).getTime() : 0;
    const existing = best.get(point.start);
    const better =
      !existing ||
      published > existing.published ||
      (published === existing.published && (point.horizonHours ?? 99) < (existing.point.horizonHours ?? 99));
    if (better) best.set(point.start, { point, published });
  }
  return [...best.values()].map((v) => v.point).toSorted((a, b) => a.start.localeCompare(b.start));
}

function toPoint(record: RawLolpRecord): HeadroomPoint | null {
  const margin = record.deratedMargin ?? record.deRatedMargin;
  const lolp = record.lossOfLoadProbability ?? record.lolp;
  if (typeof margin !== 'number' || !Number.isFinite(margin)) return null;
  if (typeof lolp !== 'number' || !Number.isFinite(lolp)) return null;

  let start: Date | null = record.startTime ? new Date(record.startTime) : null;
  if ((!start || Number.isNaN(start.getTime())) && record.settlementDate && record.settlementPeriod) {
    // Approximation: ignores the 46/50-period clock-change days.
    start = new Date(atUkTime(record.settlementDate, '00:00').getTime() + (record.settlementPeriod - 1) * 30 * durations.MINUTE);
  }
  if (!start || Number.isNaN(start.getTime())) return null;

  const point: HeadroomPoint = {
    start: start.toISOString(),
    settlementPeriod: record.settlementPeriod ?? 0,
    deratedMarginMW: Math.round(margin),
    lossOfLoadProbability: Math.min(1, Math.max(0, lolp)),
  };
  if (typeof record.forecastHorizon === 'number') point.horizonHours = record.forecastHorizon;
  return point;
}

export interface HeadroomSummary {
  tightest: HeadroomPoint;
  peakLolp: HeadroomPoint;
}

/** The tightest upcoming half-hour and the one with the highest loss-of-load probability. */
export function summariseHeadroom(points: HeadroomPoint[], now: Date): HeadroomSummary | null {
  const upcoming = points.filter((p) => new Date(p.start).getTime() + 30 * durations.MINUTE > now.getTime());
  if (upcoming.length === 0) return null;
  let tightest = upcoming[0]!;
  let peakLolp = upcoming[0]!;
  for (const p of upcoming) {
    if (p.deratedMarginMW < tightest.deratedMarginMW) tightest = p;
    if (p.lossOfLoadProbability > peakLolp.lossOfLoadProbability) peakLolp = p;
  }
  return { tightest, peakLolp };
}

/** `4.2 GW`, `850 MW`. */
export function formatPower(mw: number): string {
  if (Math.abs(mw) >= 1000) return `${(mw / 1000).toFixed(1)} GW`;
  return `${Math.round(mw)} MW`;
}

/** Plain-English odds for a probability: `less than 1 in 10,000`, `about 1 in 250`. */
export function formatOdds(p: number): string {
  if (p <= 0.0001) return 'less than 1 in 10,000';
  if (p >= 0.5) return 'more likely than not';
  const n = Math.round(1 / p);
  const rounded = n >= 1000 ? Math.round(n / 100) * 100 : n >= 100 ? Math.round(n / 10) * 10 : n;
  return `about 1 in ${rounded.toLocaleString('en-GB')}`;
}
