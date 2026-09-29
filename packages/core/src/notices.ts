import { atUkTime, addDaysToKey, fromUkLocal, overlaps, ukDayKey, durations } from './time.ts';
import type { Notice, NoticeEvent, NoticeKind, SourceRef, TimeWindow } from './types.ts';

/** National escalation level, 0 (normal) to 4 (rotating power cuts). */
export type NationalLevel = 0 | 1 | 2 | 3 | 4;

export interface NoticeKindInfo {
  kind: NoticeKind;
  /** What we call it in the app. */
  name: string;
  /** What the system operator calls it. */
  officialName: string;
  level: Exclude<NationalLevel, 0>;
  /** One sentence: what it means. */
  meaning: string;
  /** Typical warning time before the period it covers. */
  leadTime: string;
  /** What usually happens next. */
  usualOutcome: string;
  /** What a household should do. */
  whatToDo: string;
}

export const NOTICE_KINDS: Record<NoticeKind, NoticeKindInfo> = {
  EMN: {
    kind: 'EMN',
    name: 'Grid notice',
    officialName: 'Electricity Margin Notice',
    level: 1,
    meaning:
      'NESO expects less spare capacity than it would like for a period, and asks generators to make more power available.',
    leadTime: 'Usually hours ahead, often the night before.',
    usualOutcome: 'Generators respond and the notice is normally cancelled before the period starts.',
    whatToDo: 'Nothing. It is a routine precaution, not a warning of power cuts.',
  },
  CMN: {
    kind: 'CMN',
    name: 'Capacity alert',
    officialName: 'Capacity Market Notice',
    level: 1,
    meaning:
      'An automatic signal that spare capacity is forecast to be low, telling capacity providers to be ready to deliver.',
    leadTime: 'About four hours ahead.',
    usualOutcome: 'Most are withdrawn as the forecast improves.',
    whatToDo: 'Nothing for households.',
  },
  HRDR: {
    kind: 'HRDR',
    name: 'Risk of controlled cuts',
    officialName: 'High Risk of Demand Reduction',
    level: 2,
    meaning:
      'NESO sees a high risk that it may need to reduce demand, which can include switching some areas off in a controlled way.',
    leadTime: 'Hours ahead.',
    usualOutcome: 'Usually stood down, but treat it as a prompt to get ready.',
    whatToDo: 'Charge phones and power banks, find your rota letter and keep an eye on updates.',
  },
  DCI: {
    kind: 'DCI',
    name: 'Controlled cuts imminent',
    officialName: 'Demand Control Imminent',
    level: 3,
    meaning: 'NESO expects to instruct network operators to reduce demand shortly.',
    leadTime: 'Around 30 minutes.',
    usualOutcome: 'Controlled disconnections may follow in some areas.',
    whatToDo: 'Charge what you can now and check whether your rota block is affected.',
  },
  DCRP: {
    kind: 'DCRP',
    name: 'Rotating power cuts',
    officialName: 'Demand Control Rotation Protocol',
    level: 4,
    meaning:
      'Areas take turns to be switched off to protect the wider system. Each block is off for a set period, reported as up to about 3 hours.',
    leadTime: 'Reported as about 8 hours.',
    usualOutcome: 'Blocks rotate until supply recovers. Critical sites such as major hospitals are protected.',
    whatToDo: 'Check your block times and get ready before your window starts.',
  },
};

export const NATIONAL_LEVELS: Record<NationalLevel, { name: string; short: string }> = {
  0: { name: 'Normal', short: 'Normal' },
  1: { name: 'Grid notice in force', short: 'Grid notice' },
  2: { name: 'Risk of controlled cuts', short: 'Risk' },
  3: { name: 'Controlled cuts imminent', short: 'Imminent' },
  4: { name: 'Rotating power cuts', short: 'Rotating cuts' },
};

// ---------------------------------------------------------------------------
// Parsing the system operator's warning messages
// ---------------------------------------------------------------------------

/** A system warning as published (Elexon BMRS dataset SYSWARN). */
export interface RawSystemWarning {
  publishTime: string;
  warningType?: string;
  warningText: string;
}

export interface ParsedWarning {
  kind: NoticeKind | null;
  isCancellation: boolean;
  publishedAt: Date;
  window?: { start: Date; end: Date };
  shortfallMW?: number;
  text: string;
}

/** Most serious first. Mirrored in the Android background check (WarningClassifier.java). */
export const KIND_PATTERNS: ReadonlyArray<[NoticeKind, RegExp]> = [
  ['DCRP', /DEMAND CONTROL ROTATION|\bDCRP\b|ROTA(?:TIONAL)?\s+(?:LOAD\s+)?DISCONNECTION/],
  ['DCI', /DEMAND CONTROL IMMINENT|\bDCI\b/],
  ['HRDR', /HIGH RISK OF DEMAND (?:REDUCTION|CONTROL)|\bHRDR\b/],
  ['CMN', /CAPACITY MARKET NOTICE|\bCMN\b/],
  ['EMN', /ELECTRICITY MARGIN NOTICE|\bEMN\b|INADEQUATE SYSTEM MARGIN|\bNISM\b/],
];

export const CANCELLATION = /(?<!(?:MAY|WILL|COULD|MIGHT) BE )\b(?:CANCELL?ED|CANCELL?ATION|WITHDRAWN|NO LONGER (?:IN FORCE|APPLIES|APPLICABLE))\b/;

const MONTHS = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
];

export function classifyWarning(warningType: string | undefined, text: string): {
  kind: NoticeKind | null;
  isCancellation: boolean;
} {
  const haystack = `${warningType ?? ''} ${text}`.toUpperCase().replace(/\s+/g, ' ');
  const match = KIND_PATTERNS.find(([, pattern]) => pattern.test(haystack));
  return { kind: match ? match[0] : null, isCancellation: CANCELLATION.test(haystack) };
}

/**
 * Parse a published warning. Message wording is free text and has changed over
 * the years, so parsing is deliberately forgiving: anything we cannot read is
 * left undefined rather than guessed.
 */
export function parseWarning(raw: RawSystemWarning): ParsedWarning | null {
  const publishedAt = new Date(raw.publishTime);
  if (Number.isNaN(publishedAt.getTime())) return null;
  const text = sanitiseText(raw.warningText);
  const { kind, isCancellation } = classifyWarning(raw.warningType, text);
  const parsed: ParsedWarning = { kind, isCancellation, publishedAt, text };
  const window = parseWindow(text, publishedAt);
  if (window) parsed.window = window;
  const shortfall = parseShortfall(text);
  if (shortfall !== undefined) parsed.shortfallMW = shortfall;
  return parsed;
}

/**
 * Plain text with the message's line structure kept. The live feed mixes real
 * line breaks with literal "\n" sequences, so both become newlines; control
 * characters go, runs of spaces and blank lines collapse.
 */
export function sanitiseText(input: string): string {
  return (
    input
      .replace(/\\r\\n|\\n|\\r/g, '\n')
      .replace(/\r\n?/g, '\n')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
      .split('\n')
      .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
      .join('\n')
      .replace(/\n{2,}/g, '\n')
      .trim()
      .slice(0, 4000)
  );
}

export function parseShortfall(text: string): number | undefined {
  const specific = /SHORTFALL[^0-9]{0,40}?([\d,]+(?:\.\d+)?)\s*MW/i.exec(text);
  const any = specific ?? /([\d,]+(?:\.\d+)?)\s*MW\b/i.exec(text);
  if (!any?.[1]) return undefined;
  const value = Number(any[1].replace(/,/g, ''));
  return Number.isFinite(value) ? Math.round(value) : undefined;
}

export function parseWindow(text: string, publishedAt: Date): { start: Date; end: Date } | undefined {
  const times =
    /(?<![\d/])([01]?\d|2[0-3])[:.]?([0-5]\d)\s*(?:HRS|HOURS|H)?\s*(?:TO|UNTIL|TILL|AND|-|–)\s*([01]?\d|2[0-4])[:.]?([0-5]\d)\s*(?:HRS|HOURS|H)?(?![\d/])/i.exec(
      text,
    );
  if (!times) return undefined;
  const [startH, startM, endH, endM] = [times[1], times[2], times[3], times[4]].map(Number) as [
    number,
    number,
    number,
    number,
  ];

  let dayKey = parseDateKey(text) ?? ukDayKey(publishedAt);
  let start = atUkTime(dayKey, `${startH}:${pad(startM)}`);
  let end = endH === 24 ? atUkTime(addDaysToKey(dayKey, 1), `0:${pad(endM)}`) : atUkTime(dayKey, `${endH}:${pad(endM)}`);
  if (end.getTime() <= start.getTime()) end = new Date(end.getTime() + durations.DAY);

  // No explicit date and the window has already passed: it refers to tomorrow.
  if (!parseDateKey(text) && end.getTime() < publishedAt.getTime()) {
    dayKey = addDaysToKey(dayKey, 1);
    start = new Date(start.getTime() + durations.DAY);
    end = new Date(end.getTime() + durations.DAY);
  }
  return { start, end };
}

function parseDateKey(text: string): string | undefined {
  const numeric = /(?<!\d)(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)/.exec(text);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    let year = Number(numeric[3]);
    if (year < 100) year += 2000;
    if (validDate(year, month, day)) return `${year}-${pad(month)}-${pad(day)}`;
  }
  const worded = /(?<!\d)(\d{1,2})(?:ST|ND|RD|TH)?\s+(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+(\d{4})/i.exec(
    text,
  );
  if (worded) {
    const day = Number(worded[1]);
    const month = MONTHS.indexOf((worded[2] ?? '').toUpperCase()) + 1;
    const year = Number(worded[3]);
    if (validDate(year, month, day)) return `${year}-${pad(month)}-${pad(day)}`;
  }
  return undefined;
}

function validDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = fromUkLocal(year, month, day, 12);
  return ukDayKey(d) === `${year}-${pad(month)}-${pad(day)}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// ---------------------------------------------------------------------------
// Building notice lifecycles (issued -> updated -> cancelled)
// ---------------------------------------------------------------------------

const LINK_WINDOW_MS = 36 * durations.HOUR;

/**
 * Group parsed warnings into notices with a history. A cancellation or update
 * attaches to the most recent open notice of the same kind whose window
 * overlaps (or that has no window) and that was active within the last 36 hours.
 */
export function buildNotices(warnings: ParsedWarning[], source: SourceRef): Notice[] {
  const sorted = warnings
    .filter((w): w is ParsedWarning & { kind: NoticeKind } => w.kind !== null)
    .toSorted((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());

  const notices: Notice[] = [];
  for (const warning of sorted) {
    const candidate = findOpenNotice(notices, warning);
    const event: NoticeEvent = {
      type: warning.isCancellation ? 'cancelled' : candidate ? 'updated' : 'issued',
      at: warning.publishedAt.toISOString(),
      sourceText: warning.text,
    };
    if (warning.shortfallMW !== undefined) event.shortfallMW = warning.shortfallMW;
    if (warning.window) event.window = toWindow(warning.window);

    if (candidate) {
      if (isDuplicate(candidate, event)) continue;
      candidate.history.push(event);
      if (event.window && event.type !== 'cancelled') candidate.window = event.window;
      if (event.shortfallMW !== undefined && event.type !== 'cancelled') candidate.shortfallMW = event.shortfallMW;
      if (event.type === 'cancelled') candidate.cancelled = true;
      continue;
    }

    const notice: Notice = {
      id: noticeId(warning.kind, warning.publishedAt),
      kind: warning.kind,
      cancelled: event.type === 'cancelled',
      history: [event],
      source,
    };
    if (event.window) notice.window = event.window;
    if (event.shortfallMW !== undefined && event.type !== 'cancelled') notice.shortfallMW = event.shortfallMW;
    notices.push(notice);
  }
  return notices;
}

function findOpenNotice(notices: Notice[], warning: ParsedWarning & { kind: NoticeKind }): Notice | undefined {
  for (let i = notices.length - 1; i >= 0; i--) {
    const notice = notices[i];
    if (!notice || notice.kind !== warning.kind || notice.cancelled) continue;
    const last = notice.history[notice.history.length - 1];
    if (!last) continue;
    if (warning.publishedAt.getTime() - new Date(last.at).getTime() > LINK_WINDOW_MS) continue;
    if (!notice.window || !warning.window) return notice;
    if (overlaps(new Date(notice.window.start), new Date(notice.window.end), warning.window.start, warning.window.end)) {
      return notice;
    }
  }
  return undefined;
}

function isDuplicate(notice: Notice, event: NoticeEvent): boolean {
  const last = notice.history[notice.history.length - 1];
  return !!last && last.type !== 'cancelled' && event.type === 'updated' && last.sourceText === event.sourceText;
}

export function noticeId(kind: NoticeKind, firstPublished: Date): string {
  const stamp = firstPublished.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `${kind.toLowerCase()}-${stamp}`;
}

function toWindow(window: { start: Date; end: Date }): TimeWindow {
  return { start: window.start.toISOString(), end: window.end.toISOString() };
}

// ---------------------------------------------------------------------------
// State at a point in time
// ---------------------------------------------------------------------------

export type NoticeState = 'active' | 'cancelled' | 'ended';

/** A notice with no window stays active for 12 hours after its last message. */
const OPEN_ENDED_MS = 12 * durations.HOUR;

export function noticeState(notice: Notice, now: Date): NoticeState {
  if (notice.cancelled) return 'cancelled';
  if (notice.window) return now.getTime() < new Date(notice.window.end).getTime() ? 'active' : 'ended';
  const last = notice.history[notice.history.length - 1];
  const lastAt = last ? new Date(last.at).getTime() : 0;
  return now.getTime() - lastAt < OPEN_ENDED_MS ? 'active' : 'ended';
}

export function activeNotices(notices: Notice[], now: Date): Notice[] {
  return notices.filter((n) => noticeState(n, now) === 'active');
}

export function firstIssuedAt(notice: Notice): Date {
  const first = notice.history[0];
  return new Date(first ? first.at : 0);
}

export function lastEvent(notice: Notice): NoticeEvent | undefined {
  return notice.history[notice.history.length - 1];
}

/** Newest first, active before resolved. */
export function sortNotices(notices: Notice[], now: Date): Notice[] {
  return notices.toSorted((a, b) => {
    const aActive = noticeState(a, now) === 'active' ? 1 : 0;
    const bActive = noticeState(b, now) === 'active' ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    return new Date(lastEvent(b)?.at ?? 0).getTime() - new Date(lastEvent(a)?.at ?? 0).getTime();
  });
}
