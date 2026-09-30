import { NOTICE_KINDS } from './notices.ts';
import { windowsForLetter, type RotaLetter } from './rota.ts';
import { formatClock, formatWindow } from './time.ts';
import type { Notice, NoticeKind, RotationSchedule } from './types.ts';

/**
 * How much a person wants to hear. The default is `balanced`: margin notices
 * are shown in the app but never pushed, in line with NESO's own advice that
 * they are not a warning of power cuts.
 */
export type Sensitivity = 'essential' | 'balanced' | 'everything';

export const SENSITIVITIES: Record<Sensitivity, { label: string; description: string }> = {
  essential: {
    label: 'Only when I need to act',
    description: 'Your block is scheduled, or controlled cuts are imminent.',
  },
  balanced: {
    label: 'Heads-ups too',
    description: 'Also warnings of a high risk of controlled cuts. Recommended.',
  },
  everything: {
    label: 'Every grid notice',
    description: 'Also routine margin notices, which almost never lead to power cuts.',
  },
};

export interface AlertPrefs {
  sensitivity: Sensitivity;
  rotaLetter?: RotaLetter | null;
}

export type AlertEvent =
  | { type: 'notice'; change: 'issued' | 'updated' | 'cancelled'; notice: Notice }
  | { type: 'rotation'; change: 'announced' | 'changed' | 'cancelled'; rotation: RotationSchedule };

export interface Alert {
  title: string;
  body: string;
  /** In-app path to open when tapped. */
  url: string;
  /** Replaces an earlier alert about the same thing instead of stacking. */
  tag: string;
  urgency: 'normal' | 'high';
}

const MIN_SENSITIVITY: Record<NoticeKind, Sensitivity> = {
  EMN: 'everything',
  CMN: 'everything',
  HRDR: 'balanced',
  DCI: 'essential',
  DCRP: 'balanced',
};

const RANK: Record<Sensitivity, number> = { essential: 0, balanced: 1, everything: 2 };

function wants(prefs: AlertPrefs, minimum: Sensitivity): boolean {
  return RANK[prefs.sensitivity] >= RANK[minimum];
}

/** Every alert level, least to most. */
export const SENSITIVITY_ORDER: readonly Sensitivity[] = ['essential', 'balanced', 'everything'];

/**
 * For topic-based push: the alert for a notice change, and every alert level
 * that should get it. Notice alerts don't depend on who receives them beyond
 * the level, so one message per change reaches everyone who asked for it.
 */
export function noticeBroadcast(
  event: Extract<AlertEvent, { type: 'notice' }>,
  now: Date,
): { alert: Alert; audience: Sensitivity[] } | null {
  let alert: Alert | null = null;
  const audience: Sensitivity[] = [];
  for (const sensitivity of SENSITIVITY_ORDER) {
    const a = alertFor(event, { sensitivity }, now);
    if (a) {
      alert = a;
      audience.push(sensitivity);
    }
  }
  return alert ? { alert, audience } : null;
}

/** Decide whether and how to alert one subscriber about one change. */
export function alertFor(event: AlertEvent, prefs: AlertPrefs, now: Date): Alert | null {
  return event.type === 'notice' ? noticeAlert(event, prefs, now) : rotationAlert(event, prefs, now);
}

function noticeAlert(
  event: Extract<AlertEvent, { type: 'notice' }>,
  prefs: AlertPrefs,
  now: Date,
): Alert | null {
  const { notice, change } = event;
  if (!wants(prefs, MIN_SENSITIVITY[notice.kind])) return null;
  // Updates only matter when they change the time window; shortfall revisions stay in the app.
  if (change === 'updated') return null;
  const info = NOTICE_KINDS[notice.kind];
  const when = notice.window ? formatWindow(new Date(notice.window.start), new Date(notice.window.end), now) : '';
  const url = `/notices/${encodeURIComponent(notice.id)}`;
  const tag = `notice-${notice.id}`;

  if (change === 'cancelled') {
    return {
      title: `Stood down: ${info.name.toLowerCase()}`,
      body: when ? `The ${info.officialName} for ${when} has been cancelled.` : `The ${info.officialName} has been cancelled.`,
      url,
      tag,
      urgency: 'normal',
    };
  }

  switch (notice.kind) {
    case 'DCI':
      return {
        title: 'Controlled power cuts may start soon',
        body: 'NESO expects to reduce demand shortly. Charge phones now and check your rota block.',
        url,
        tag,
        urgency: 'high',
      };
    case 'HRDR':
      return {
        title: 'Small chance of controlled cuts',
        body: `High risk of demand reduction${when ? ` ${when}` : ''}. Charge phones and find your rota letter.`,
        url,
        tag,
        urgency: 'normal',
      };
    case 'DCRP':
      // The published schedule, when there is one, is alerted per block (rotationAlert).
      // This is the warning itself, so nobody misses it if the schedule is late or absent.
      return {
        title: 'Rotating power cuts announced',
        body: 'Open the app for your block’s times, and check NESO’s announcement.',
        url: '/',
        tag,
        urgency: 'high',
      };
    default:
      return {
        title: `${info.name}${when ? ` ${when}` : ''}`,
        body: 'A routine request for more generation. Not a warning of power cuts; nothing to do.',
        url,
        tag,
        urgency: 'normal',
      };
  }
}

function rotationAlert(
  event: Extract<AlertEvent, { type: 'rotation' }>,
  prefs: AlertPrefs,
  now: Date,
): Alert | null {
  const { rotation, change } = event;
  const tag = `rotation-${rotation.announcedAt}`;
  const letter = prefs.rotaLetter ?? null;
  const mine = letter
    ? windowsForLetter(rotation, letter).filter((w) => new Date(w.end).getTime() > now.getTime())
    : [];

  if (change === 'cancelled') {
    if (letter && mine.length === 0 && !wants(prefs, 'balanced')) return null;
    return {
      title: 'Rotating power cuts stood down',
      body: 'The rota has been cancelled. No planned cuts for your block.',
      url: '/',
      tag,
      urgency: 'normal',
    };
  }

  if (!letter) {
    return {
      title: 'Rotating power cuts planned',
      body: 'Add your rota letter in the app to see if and when your block is affected.',
      url: '/settings',
      tag,
      urgency: 'high',
    };
  }

  const first = mine[0];
  if (first) {
    const start = new Date(first.start);
    const end = new Date(first.end);
    const more = mine.length > 1 ? ` and ${mine.length - 1} more period${mine.length > 2 ? 's' : ''}` : '';
    return {
      title: `Block ${letter}: power off ${formatWindow(start, end, now)}`,
      body: `Planned rotating cut from ${formatClock(start)} to ${formatClock(end)}${more}. Charge devices before it starts.`,
      url: '/',
      tag,
      urgency: 'high',
    };
  }

  if (!wants(prefs, 'balanced')) return null;
  return {
    title: 'Rotating cuts planned, not your block',
    body: `Block ${letter} isn’t on the current rota. We’ll tell you if that changes.`,
    url: '/',
    tag,
    urgency: 'normal',
  };
}
