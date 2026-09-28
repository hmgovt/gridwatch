/**
 * Time helpers pinned to UK local time (Europe/London).
 *
 * Everything user-facing is shown in UK time regardless of the device's own
 * time zone: grid notices, rota windows and settlement periods are all defined
 * in UK local time.
 */

export const UK_TIME_ZONE = 'Europe/London';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: UK_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  weekday: 'short',
});

const dayLabelFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: UK_TIME_ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

export interface UkParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: string;
}

export function ukParts(date: Date): UkParts {
  const out: Record<string, string> = {};
  for (const part of partsFormatter.formatToParts(date)) out[part.type] = part.value;
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour) % 24,
    minute: Number(out.minute),
    second: Number(out.second),
    weekday: out.weekday ?? '',
  };
}

/** Minutes UK local time is ahead of UTC at this instant (0 in winter, 60 in summer). */
export function ukOffsetMinutes(date: Date): number {
  const p = ukParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const wholeSeconds = Math.floor(date.getTime() / 1000) * 1000;
  return Math.round((asUtc - wholeSeconds) / MINUTE);
}

/** The instant at which UK clocks show the given local date and time. */
export function fromUkLocal(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  let ts = naive - ukOffsetMinutes(new Date(naive)) * MINUTE;
  ts = naive - ukOffsetMinutes(new Date(ts)) * MINUTE;
  return new Date(ts);
}

/** `YYYY-MM-DD` for the UK calendar day containing `date`. */
export function ukDayKey(date: Date): string {
  const p = ukParts(date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function parseDayKey(key: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) throw new Error(`Invalid day key: ${key}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function addDaysToKey(key: string, days: number): string {
  const { year, month, day } = parseDayKey(key);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Instant for a UK local clock time (`HH:MM`) on a UK calendar day (`YYYY-MM-DD`). */
export function atUkTime(dayKey: string, hhmm: string): Date {
  const { year, month, day } = parseDayKey(dayKey);
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!match) throw new Error(`Invalid time: ${hhmm}`);
  return fromUkLocal(year, month, day, Number(match[1]), Number(match[2]));
}

export function startOfUkDay(date: Date): Date {
  const p = ukParts(date);
  return fromUkLocal(p.year, p.month, p.day);
}

/** Minutes since UK midnight, as a fraction (e.g. 16:30:30 -> 990.5). */
export function minutesIntoUkDay(date: Date): number {
  const p = ukParts(date);
  return p.hour * 60 + p.minute + p.second / 60;
}

/**
 * Settlement period (1-48) for a UK local time. GB electricity is traded and
 * forecast in half-hour settlement periods starting at UK midnight. Clock-change
 * days have 46 or 50 periods; this simple mapping is for display only.
 */
export function settlementPeriodOf(date: Date): number {
  return Math.floor(minutesIntoUkDay(date) / 30) + 1;
}

/** `16:05` in UK time. */
export function formatClock(date: Date): string {
  const p = ukParts(date);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** `Today`, `Tomorrow`, `Yesterday` or `Mon 28 Sep`, relative to `now` in UK time. */
export function formatDay(date: Date, now: Date): string {
  const key = ukDayKey(date);
  const today = ukDayKey(now);
  if (key === today) return 'Today';
  if (key === addDaysToKey(today, 1)) return 'Tomorrow';
  if (key === addDaysToKey(today, -1)) return 'Yesterday';
  return dayLabelFormatter.format(date);
}

/** `16:00–19:00 today`, `16:00–19:00 tomorrow` or `Tue 3 Nov, 16:00–19:00`. */
export function formatWindow(start: Date, end: Date, now: Date): string {
  const range = `${formatClock(start)}–${formatClock(end)}`;
  const day = formatDay(start, now);
  if (day === 'Today' || day === 'Tomorrow' || day === 'Yesterday') return `${range} ${day.toLowerCase()}`;
  return `${day}, ${range}`;
}

/** `45 min`, `2 h 15 min`, `3 days`. */
export function formatDuration(ms: number): string {
  const abs = Math.abs(ms);
  if (abs < MINUTE) return 'less than a minute';
  if (abs < HOUR) return `${Math.round(abs / MINUTE)} min`;
  if (abs < DAY) {
    const hours = Math.floor(abs / HOUR);
    const minutes = Math.round((abs - hours * HOUR) / MINUTE);
    if (minutes === 60) return `${hours + 1} h`;
    return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
  }
  const days = Math.round(abs / DAY);
  return `${days} day${days === 1 ? '' : 's'}`;
}

/** `in 2 h 15 min`, `12 min ago`, `just now`. */
export function formatRelative(date: Date, now: Date): string {
  const diff = date.getTime() - now.getTime();
  if (Math.abs(diff) < MINUTE) return 'just now';
  return diff > 0 ? `in ${formatDuration(diff)}` : `${formatDuration(diff)} ago`;
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export const durations = { MINUTE, HOUR, DAY } as const;
