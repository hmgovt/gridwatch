/**
 * Shared data model. The API serialises these types as JSON (dates as ISO 8601
 * strings); clients and the push worker read them through the same helpers.
 */

/** Official GB system notices, in escalation order. */
export type NoticeKind = 'EMN' | 'CMN' | 'HRDR' | 'DCI' | 'DCRP';

export type NoticeEventType = 'issued' | 'updated' | 'cancelled';

export interface NoticeEvent {
  type: NoticeEventType;
  /** When the source published this message (ISO 8601). */
  at: string;
  shortfallMW?: number;
  window?: TimeWindow;
  /** The source's own wording, kept verbatim for transparency. Plain text only. */
  sourceText?: string;
}

export interface TimeWindow {
  start: string;
  end: string;
}

export interface Notice {
  /** Stable id derived from kind and first publication time. */
  id: string;
  kind: NoticeKind;
  /** Current window of concern, if the notice names one. */
  window?: TimeWindow;
  /** Latest stated shortfall, if any. */
  shortfallMW?: number;
  cancelled: boolean;
  /** Oldest first. */
  history: NoticeEvent[];
  source: SourceRef;
}

export interface SourceRef {
  name: string;
  url?: string;
}

/** One half-hour of NESO's loss-of-load and de-rated margin forecast. */
export interface HeadroomPoint {
  /** Start of the settlement period (ISO 8601). */
  start: string;
  settlementPeriod: number;
  /** De-rated margin: spare capacity after meeting demand, in MW. */
  deratedMarginMW: number;
  /** Loss of load probability, 0-1. */
  lossOfLoadProbability: number;
  /** Hours ahead the forecast was made (1, 2, 4, 8 or 12). */
  horizonHours?: number;
}

/** A published rota: which blocks (rota letters) are off, and when. */
export interface RotationSchedule {
  announcedAt: string;
  windows: RotationWindow[];
  source: SourceRef;
}

export interface RotationWindow {
  blocks: string[];
  start: string;
  end: string;
}

export interface FrequencyReading {
  at: string;
  hz: number;
}

export interface SourceHealth {
  id: string;
  label: string;
  lastSuccessAt?: string;
  lastAttemptAt?: string;
  ok: boolean;
  /** Critical sources decide whether the status can be trusted. */
  critical?: boolean;
}

export interface ScenarioMeta {
  id: string;
  title: string;
  description: string;
  /** True for invented situations; false for replays of real events. */
  hypothetical: boolean;
  /** The moment the scenario is shown at (ISO 8601). */
  at: string;
  sourceNote?: string;
}

export interface StatusSnapshot {
  generatedAt: string;
  mode: 'live' | 'scenario';
  notices: Notice[];
  headroom: HeadroomPoint[];
  rotation: RotationSchedule | null;
  frequency: FrequencyReading | null;
  /** The last few minutes of readings, oldest first, when available. */
  frequencyTrace?: FrequencyReading[];
  sources: SourceHealth[];
  scenario?: ScenarioMeta;
}
