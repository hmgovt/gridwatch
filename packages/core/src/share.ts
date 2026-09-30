import { activeNotices, NOTICE_KINDS, sortNotices } from './notices.ts';
import { formatClock, formatWindow } from './time.ts';
import type { Notice, NoticeEventType, StatusSnapshot } from './types.ts';

/**
 * What we say when a notice is shared or posted: the share card in the app
 * and the automated social posts use the same words. Written to docs/VOICE.md:
 * facts first, then what it means, then what to do. No fear, no jokes.
 */
export type ShareTone = 'calm' | 'notice' | 'warning' | 'urgent' | 'standdown';

export interface ShareCard {
  /** Small label above the headline. */
  eyebrow: string;
  headline: string;
  /** One sentence: what it means. */
  meaning: string;
  /** One sentence: what to do. */
  action: string;
  /** Optional figure, e.g. the stated shortfall. */
  detail?: string;
  tone: ShareTone;
  /** In-app path the card links to. */
  path: string;
}

const MEANING: Record<Notice['kind'], string> = {
  EMN: 'NESO has asked generators for more headroom. Routine: these are nearly always cancelled.',
  CMN: 'An automatic signal that spare capacity is forecast to be low. Most are withdrawn as the forecast improves.',
  HRDR: 'NESO warns it may need to reduce demand. Warnings like this are usually stood down.',
  DCI: 'NESO expects to reduce demand shortly. Some areas may be switched off.',
  DCRP: 'Areas take turns to be switched off, each for up to about 3 hours.',
};

const ACTION: Record<Notice['kind'], string> = {
  EMN: 'Not a warning of power cuts. Nothing to do.',
  CMN: 'Nothing to do for households.',
  HRDR: 'Charge phones and find your rota letter.',
  DCI: 'Charge phones now and check your rota letter.',
  DCRP: 'Check your rota letter and your block’s times.',
};

const TONE: Record<Notice['kind'], ShareTone> = { EMN: 'notice', CMN: 'notice', HRDR: 'warning', DCI: 'urgent', DCRP: 'urgent' };

function when(notice: Notice, now: Date): string {
  return notice.window ? formatWindow(new Date(notice.window.start), new Date(notice.window.end), now) : '';
}

/** The card for one change to one notice. */
export function noticeCard(notice: Notice, change: NoticeEventType, now: Date): ShareCard {
  const info = NOTICE_KINDS[notice.kind];
  const w = when(notice, now);
  const path = `/notices/${notice.id}`;
  if (change === 'cancelled') {
    return {
      eyebrow: 'Stood down',
      headline: `${info.name}${w ? ` ${w}` : ''}: cancelled`,
      meaning: `NESO has cancelled the ${info.officialName}.`,
      action: 'No action needed.',
      tone: 'standdown',
      path,
    };
  }
  const card: ShareCard = {
    eyebrow: change === 'updated' ? `Update · ${info.officialName}` : info.officialName,
    headline: `${info.name}${w ? ` ${w}` : ''}`,
    meaning: MEANING[notice.kind],
    action: ACTION[notice.kind],
    tone: TONE[notice.kind],
    path,
  };
  if (notice.shortfallMW !== undefined) card.detail = `Stated shortfall ${notice.shortfallMW.toLocaleString('en-GB')} MW`;
  if (!w) card.detail = [card.detail, `Issued ${formatClock(new Date(notice.history[0]?.at ?? now))}`].filter(Boolean).join(' · ');
  return card;
}

/** The card for "right now": the most serious notice in force, or a calm all-clear. */
export function nationalCard(snapshot: StatusSnapshot, now: Date): ShareCard {
  const top = sortNotices(activeNotices(snapshot.notices, now), now).toSorted(
    (a, b) => NOTICE_KINDS[b.kind].level - NOTICE_KINDS[a.kind].level,
  )[0];
  if (top) return noticeCard(top, top.history.length > 1 ? 'updated' : 'issued', now);
  const card: ShareCard = {
    eyebrow: 'Grid status',
    headline: 'Nothing to report',
    meaning: 'No NESO warnings in force. The grid has the spare capacity it needs.',
    action: 'Nothing to do.',
    tone: 'calm',
    path: '/',
  };
  if (snapshot.frequency) card.detail = `Frequency ${snapshot.frequency.hz.toFixed(2)} Hz`;
  return card;
}

/** A post for social media or a share sheet: under 300 characters with the link. */
export function shareText(card: ShareCard, siteUrl: string): string {
  const url = `${siteUrl.replace(/\/$/, '')}${card.path === '/' ? '' : card.path}`;
  const lead = card.tone === 'standdown' ? `Stood down: ${card.headline.replace(/: cancelled$/, '')}.` : `${card.headline}.`;
  const detail = card.detail ? ` ${card.detail}.` : '';
  const body = card.tone === 'standdown' ? ` ${card.meaning} ${card.action}` : ` ${card.meaning}${detail} ${card.action}`;
  return `${lead}${body}\n\n${url}`;
}
