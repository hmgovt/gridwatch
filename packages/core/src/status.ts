import { activeNotices, NOTICE_KINDS, type NationalLevel } from './notices.ts';
import { currentOrNextWindow, rotationInForce, type RotaLetter } from './rota.ts';
import { durations, formatClock, formatDay, formatWindow } from './time.ts';
import type { Notice, NoticeKind, StatusSnapshot, TimeWindow } from './types.ts';

/**
 * What the person should feel, in four steps. The level reflects action needed
 * by this household, not how dramatic the national picture sounds.
 */
export type PersonalLevel = 'clear' | 'headsup' | 'prepare' | 'off' | 'unknown';

export const PERSONAL_LEVELS: Record<PersonalLevel, { label: string; rank: number }> = {
  clear: { label: 'All clear', rank: 0 },
  headsup: { label: 'Heads-up', rank: 1 },
  prepare: { label: 'Get ready', rank: 2 },
  off: { label: 'Power off', rank: 3 },
  unknown: { label: 'Checking', rank: -1 },
};

export interface ActionItem {
  id: string;
  text: string;
}

export interface PersonalStatus {
  level: PersonalLevel;
  headline: string;
  summary: string;
  actions: ActionItem[];
  national: NationalLevel;
  /** The time window this status is about, for highlighting on the day ring. */
  focusWindow?: TimeWindow & { label: string };
  /** Notices behind this status, for "why am I seeing this". */
  basedOn: Notice[];
  freshness: Freshness;
  /** A gentle setup prompt, e.g. adding a rota letter. */
  nudge?: string;
}

export type Freshness = 'fresh' | 'stale' | 'offline';

export interface HouseholdPrefs {
  rotaLetter?: RotaLetter | null;
}

const STALE_MS = 20 * durations.MINUTE;
const OFFLINE_MS = 3 * durations.HOUR;
const PREPARE_WITHIN_MS = 12 * durations.HOUR;

export function freshnessOf(snapshot: StatusSnapshot, now: Date): Freshness {
  if (snapshot.mode === 'scenario') return 'fresh';
  const critical = snapshot.sources.filter((s) => s.critical);
  const considered = critical.length ? critical : snapshot.sources;
  if (considered.length === 0) return 'offline';
  const times = considered.map((s) => (s.lastSuccessAt ? new Date(s.lastSuccessAt).getTime() : 0));
  const oldest = Math.min(...times);
  const age = now.getTime() - oldest;
  if (age > OFFLINE_MS) return 'offline';
  if (age > STALE_MS) return 'stale';
  return 'fresh';
}

export function nationalLevelOf(snapshot: StatusSnapshot, now: Date): NationalLevel {
  let level: NationalLevel = 0;
  for (const notice of activeNotices(snapshot.notices, now)) {
    level = Math.max(level, NOTICE_KINDS[notice.kind].level) as NationalLevel;
  }
  if (rotationInForce(snapshot.rotation, now)) level = 4;
  return level;
}

function strongest(notices: Notice[], kinds: NoticeKind[]): Notice | undefined {
  return notices.find((n) => kinds.includes(n.kind));
}

export function assessPersonal(snapshot: StatusSnapshot, prefs: HouseholdPrefs, now: Date): PersonalStatus {
  const freshness = freshnessOf(snapshot, now);
  const active = activeNotices(snapshot.notices, now).toSorted(
    (a, b) => NOTICE_KINDS[b.kind].level - NOTICE_KINDS[a.kind].level,
  );
  const national = nationalLevelOf(snapshot, now);
  const letter = prefs.rotaLetter ?? null;
  const letterNudge = letter ? undefined : 'Add your rota letter so we can tell you if your block is affected.';

  if (freshness === 'offline') {
    return {
      level: 'unknown',
      headline: 'We can’t confirm right now',
      summary:
        'We haven’t been able to reach the grid data for a while. If your power goes off, call 105 to report it or get updates.',
      actions: [],
      national,
      basedOn: [],
      freshness,
    };
  }

  // 1. Rotating power cuts are the only thing that is about a specific household.
  const rotation = snapshot.rotation;
  if (rotationInForce(rotation, now)) {
    const basedOn = active.filter((n) => n.kind === 'DCRP');
    if (!letter) {
      return {
        level: 'prepare',
        headline: 'Rotating power cuts are planned',
        summary: 'Areas are taking turns to be switched off. Add your rota letter to see when your block is affected.',
        actions: [
          { id: 'find-letter', text: 'Find your rota letter on your electricity bill' },
          { id: 'charge', text: 'Charge phones and power banks now' },
        ],
        national,
        basedOn,
        freshness,
        nudge: letterNudge,
      };
    }
    const slot = currentOrNextWindow(rotation, letter, now);
    if (slot?.current) {
      const end = new Date(slot.window.end);
      return {
        level: 'off',
        headline: `Block ${letter} is off until ${formatClock(end)}`,
        summary: `Your area is in a planned rotation. Power should come back at about ${formatClock(end)}. If it doesn’t, call 105.`,
        actions: [
          { id: 'fridge', text: 'Keep fridge and freezer doors closed' },
          { id: 'unplug', text: 'Switch off sensitive equipment so it isn’t hit by a surge when power returns' },
          { id: 'light', text: 'Leave one light switched on so you know when power is back' },
        ],
        national,
        focusWindow: { start: slot.window.start, end: slot.window.end, label: `Block ${letter} off` },
        basedOn,
        freshness,
      };
    }
    if (slot) {
      const start = new Date(slot.window.start);
      const end = new Date(slot.window.end);
      const soon = start.getTime() - now.getTime() <= PREPARE_WITHIN_MS;
      return {
        level: soon ? 'prepare' : 'headsup',
        headline: `Block ${letter}: off ${formatWindow(start, end, now)}`,
        summary: `Your block is scheduled to be switched off from ${formatClock(start)} to ${formatClock(end)} ${formatDay(start, now).toLowerCase()}. We’ll remind you before it starts.`,
        actions: [
          { id: 'charge', text: `Charge phones, laptops and power banks before ${formatClock(start)}` },
          { id: 'cook', text: 'Plan meals and hot drinks around the cut' },
          { id: 'medical', text: 'If someone relies on powered medical equipment, call 105 now' },
          { id: 'fridge', text: 'During the cut, keep fridge and freezer doors closed' },
        ],
        national,
        focusWindow: { start: slot.window.start, end: slot.window.end, label: `Block ${letter} off` },
        basedOn,
        freshness,
      };
    }
    return {
      level: 'headsup',
      headline: `Block ${letter} isn’t scheduled`,
      summary: 'Rotating power cuts are running in some areas, but your block is not on the current rota. We’ll tell you if that changes.',
      actions: [{ id: 'charge', text: 'Keep phones charged while rotations continue' }],
      national,
      basedOn,
      freshness,
    };
  }

  // 2. Demand control is imminent somewhere on the system.
  const dci = strongest(active, ['DCI']);
  if (dci) {
    return {
      level: 'prepare',
      headline: 'Controlled cuts may start soon',
      summary:
        'NESO expects to ask network operators to reduce demand shortly. Some areas may be switched off for a short time.',
      actions: [
        { id: 'charge', text: 'Charge phones and power banks now' },
        { id: 'medical', text: 'If someone relies on powered medical equipment, have a plan ready' },
      ],
      national,
      ...windowFocus(dci, 'Demand control'),
      basedOn: [dci],
      freshness,
      ...(letterNudge ? { nudge: letterNudge } : {}),
    };
  }

  // 3. High risk of demand reduction.
  const hrdr = strongest(active, ['HRDR']);
  if (hrdr) {
    const when = hrdr.window ? ` between ${formatClock(new Date(hrdr.window.start))} and ${formatClock(new Date(hrdr.window.end))}` : '';
    return {
      level: 'headsup',
      headline: 'Small chance of controlled cuts',
      summary: `NESO has warned of a high risk it may need to reduce demand${when}. Most warnings like this are stood down, but it’s worth being ready.`,
      actions: [
        { id: 'charge', text: 'Charge phones and power banks' },
        { id: 'find-letter', text: letter ? `Your rota letter is ${letter}. We’ll alert you if your block is scheduled.` : 'Find your rota letter on your electricity bill' },
      ],
      national,
      ...windowFocus(hrdr, 'Risk window'),
      basedOn: [hrdr],
      freshness,
    };
  }

  // 4. Margin notices: national context only.
  const margin = strongest(active, ['EMN', 'CMN']);
  if (margin) {
    const when = margin.window ? ` for ${formatClock(new Date(margin.window.start))}–${formatClock(new Date(margin.window.end))}` : '';
    return {
      level: 'clear',
      headline: 'All clear for you',
      summary: `NESO has asked for extra generation${when}. It’s a routine precaution and doesn’t mean power cuts. You don’t need to do anything.`,
      actions: [],
      national,
      ...windowFocus(margin, NOTICE_KINDS[margin.kind].name),
      basedOn: [margin],
      freshness,
      ...(letterNudge ? { nudge: letterNudge } : {}),
    };
  }

  return {
    level: 'clear',
    headline: 'All clear',
    summary: 'The grid has the spare capacity it needs. Nothing for you to do.',
    actions: [],
    national,
    basedOn: [],
    freshness,
    ...(letterNudge ? { nudge: letterNudge } : {}),
  };
}

function windowFocus(notice: Notice, label: string): { focusWindow?: TimeWindow & { label: string } } {
  return notice.window ? { focusWindow: { ...notice.window, label } } : {};
}
