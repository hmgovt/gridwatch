import { z } from 'zod';
import type { RawLolpRecord, RawSystemWarning } from '@gridwatch/core';
import { fetchJson, type Fetcher, type FetchedJson } from './http.ts';

/**
 * Elexon Insights Solution (BMRS) API. Free, open licence, attribution needed.
 *
 * VERIFY before launch: the endpoint paths, query parameter names and field
 * names below follow Elexon's published API as we understand it, but could not
 * be checked against the live service from the build environment. Run
 * `pnpm --filter @gridwatch/api ingest:once` somewhere with network access and
 * compare with the archived raw responses.
 */
export const ELEXON_PATHS = {
  systemWarnings: '/datasets/SYSWARN',
  lossOfLoad: '/forecast/system/loss-of-load',
  frequency: '/system/frequency',
} as const;

const dataEnvelope = <T extends z.ZodType>(item: T) =>
  z.union([z.object({ data: z.array(item) }), z.array(item)]).transform((v) => (Array.isArray(v) ? v : v.data));

const warningSchema = z.looseObject({
  publishTime: z.string().max(40),
  warningType: z.string().max(200).optional(),
  warningText: z.string().max(10_000),
});

const lolpSchema = z.looseObject({
  publishTime: z.string().max(40).optional(),
  settlementDate: z.string().max(20).optional(),
  settlementPeriod: z.number().int().min(1).max(50).optional(),
  startTime: z.string().max(40).optional(),
  forecastHorizon: z.number().optional(),
  lossOfLoadProbability: z.number().optional(),
  lolp: z.number().optional(),
  deratedMargin: z.number().optional(),
  deRatedMargin: z.number().optional(),
});

const frequencySchema = z.looseObject({
  measurementTime: z.string().max(40),
  frequency: z.number().min(40).max(60),
});

export interface ElexonClient {
  systemWarnings(from: Date, to: Date): Promise<{ raw: FetchedJson; records: RawSystemWarning[] }>;
  lossOfLoad(from: Date, to: Date): Promise<{ raw: FetchedJson; records: RawLolpRecord[] }>;
  frequency(from: Date, to: Date): Promise<{ raw: FetchedJson; readings: Array<{ at: string; hz: number }> }>;
}

export function elexonClient(baseUrl: string, fetcher: Fetcher = fetch): ElexonClient {
  const url = (path: string, params: Record<string, string>) => {
    const u = new URL(baseUrl.replace(/\/$/, '') + path);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    u.searchParams.set('format', 'json');
    return u.toString();
  };

  return {
    async systemWarnings(from, to) {
      const raw = await fetchJson(
        fetcher,
        url(ELEXON_PATHS.systemWarnings, { publishDateTimeFrom: from.toISOString(), publishDateTimeTo: to.toISOString() }),
      );
      const records = dataEnvelope(warningSchema).parse(raw.json).map((r) => {
        const out: RawSystemWarning = { publishTime: r.publishTime, warningText: r.warningText };
        if (r.warningType) out.warningType = r.warningType;
        return out;
      });
      return { raw, records };
    },

    async lossOfLoad(from, to) {
      const raw = await fetchJson(fetcher, url(ELEXON_PATHS.lossOfLoad, { from: from.toISOString(), to: to.toISOString() }));
      const records = dataEnvelope(lolpSchema).parse(raw.json) as RawLolpRecord[];
      return { raw, records };
    },

    async frequency(from, to) {
      const raw = await fetchJson(fetcher, url(ELEXON_PATHS.frequency, { from: from.toISOString(), to: to.toISOString() }));
      const readings = dataEnvelope(frequencySchema)
        .parse(raw.json)
        .map((r) => ({ at: new Date(r.measurementTime).toISOString(), hz: r.frequency }));
      return { raw, readings };
    },
  };
}
