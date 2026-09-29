import { buildHeadroom, type RawLolpRecord } from './headroom.ts';
import { buildNotices, lastEvent, noticeState, parseWarning, sortNotices, type ParsedWarning, type RawSystemWarning } from './notices.ts';
import { durations } from './time.ts';
import type { FrequencyReading, Notice, RotationSchedule, SourceHealth, StatusSnapshot } from './types.ts';

export const LIVE_SOURCES = {
  syswarn: { id: 'syswarn', label: 'NESO system warnings (Elexon BMRS)', critical: true },
  lolpdrm: { id: 'lolpdrm', label: 'Spare capacity forecast (Elexon BMRS)', critical: false },
  freq: { id: 'freq', label: 'System frequency (Elexon BMRS)', critical: false },
} as const;

export const NOTICE_SOURCE = { name: 'NESO system warnings via Elexon BMRS', url: 'https://bmrs.elexon.co.uk/' };

/** How far back notices are rebuilt from, so updates and cancellations thread onto the right notice. */
export const NOTICE_LOOKBACK_MS = 7 * durations.DAY;
/** Resolved notices stay on the Now screen this long. */
const RECENT_MS = 48 * durations.HOUR;
/** A frequency reading older than this isn't shown as current. */
const FREQUENCY_FRESH_MS = 10 * durations.MINUTE;

/** Parse and thread raw warnings into notices, ignoring anything stamped in the future (bad data or clock skew). */
export function noticesFrom(warnings: RawSystemWarning[], now: Date, lookbackMs = NOTICE_LOOKBACK_MS): Notice[] {
  const horizon = now.getTime() + 5 * durations.MINUTE;
  const floor = now.getTime() - lookbackMs;
  const parsed = warnings
    .map(parseWarning)
    .filter((w): w is ParsedWarning => w !== null && w.publishedAt.getTime() <= horizon && w.publishedAt.getTime() >= floor);
  return buildNotices(parsed, NOTICE_SOURCE);
}

export interface LiveInputs {
  warnings: RawSystemWarning[];
  lossOfLoad: RawLolpRecord[];
  /** Recent readings, oldest first. */
  frequency: FrequencyReading[];
  rotation: RotationSchedule | null;
  sources: SourceHealth[];
}

/** The status document: identical for everyone, personalised on the device by `assessPersonal`. */
export function buildLiveSnapshot(inputs: LiveInputs, now: Date): StatusSnapshot {
  const notices = noticesFrom(inputs.warnings, now).filter((n) => {
    if (noticeState(n, now) === 'active') return true;
    const last = lastEvent(n);
    return !!last && now.getTime() - new Date(last.at).getTime() < RECENT_MS;
  });
  const trace = inputs.frequency.filter((r) => now.getTime() - new Date(r.at).getTime() < FREQUENCY_FRESH_MS);
  const window = { from: now.getTime() - 30 * durations.MINUTE, to: now.getTime() + 24 * durations.HOUR };
  const headroom = buildHeadroom(inputs.lossOfLoad).filter((p) => {
    const t = new Date(p.start).getTime();
    return t >= window.from && t <= window.to;
  });
  const snapshot: StatusSnapshot = {
    generatedAt: now.toISOString(),
    mode: 'live',
    notices: sortNotices(notices, now),
    headroom,
    rotation: inputs.rotation,
    frequency: trace.at(-1) ?? null,
    sources: inputs.sources,
  };
  if (trace.length > 1) snapshot.frequencyTrace = trace;
  return snapshot;
}
