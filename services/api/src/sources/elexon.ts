import {
  ELEXON_PATHS,
  elexonUrl,
  parseFrequency,
  parseLossOfLoad,
  parseSystemWarnings,
  type FrequencyReading,
  type RawLolpRecord,
  type RawSystemWarning,
} from '@gridwatch/core';
import { fetchJson, type Fetcher, type FetchedJson } from './http.ts';

/**
 * Elexon Insights Solution (BMRS) API. Paths and response parsing live in
 * @gridwatch/core (shared with the native app); this adds server-side fetching.
 */
export interface ElexonClient {
  systemWarnings(from: Date, to: Date): Promise<{ raw: FetchedJson; records: RawSystemWarning[] }>;
  lossOfLoad(from: Date, to: Date): Promise<{ raw: FetchedJson; records: RawLolpRecord[] }>;
  frequency(from: Date, to: Date): Promise<{ raw: FetchedJson; readings: FrequencyReading[] }>;
}

export function elexonClient(baseUrl: string, fetcher: Fetcher = fetch): ElexonClient {
  return {
    async systemWarnings(from, to) {
      const raw = await fetchJson(
        fetcher,
        elexonUrl(baseUrl, ELEXON_PATHS.systemWarnings, { publishDateTimeFrom: from.toISOString(), publishDateTimeTo: to.toISOString() }),
      );
      return { raw, records: parseSystemWarnings(raw.json) };
    },

    async lossOfLoad(from, to) {
      const raw = await fetchJson(fetcher, elexonUrl(baseUrl, ELEXON_PATHS.lossOfLoad, { from: from.toISOString(), to: to.toISOString() }));
      return { raw, records: parseLossOfLoad(raw.json) };
    },

    async frequency(from, to) {
      const raw = await fetchJson(fetcher, elexonUrl(baseUrl, ELEXON_PATHS.frequency, { from: from.toISOString(), to: to.toISOString() }));
      return { raw, readings: parseFrequency(raw.json) };
    },
  };
}
