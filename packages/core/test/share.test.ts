import { describe, expect, it } from 'vitest';
import {
  buildScenario,
  marginNotice28SepCancelled,
  nationalCard,
  noticeBroadcast,
  noticeCard,
  shareText,
  type Notice,
  type NoticeKind,
} from '../src/index.ts';

const now = new Date('2026-09-28T12:20:00Z');
const site = 'https://everybodyhz.example';

describe('share cards and posts', () => {
  it('describes the real 28 September notice plainly', () => {
    const snapshot = buildScenario('emn-2026-09-28', now);
    const card = nationalCard(snapshot, now);
    expect(card.headline).toBe('Grid notice 16:00–19:00 today');
    expect(card.detail).toBe('Stated shortfall 104 MW');
    expect(shareText(card, site)).toBe(
      'Grid notice 16:00–19:00 today. NESO has asked generators for more headroom. Routine: these are nearly always cancelled. ' +
        'Stated shortfall 104 MW. Not a warning of power cuts. Nothing to do.\n\n' +
        `${site}/notices/emn-20260927T232600Z`,
    );
  });

  it('says when a notice is stood down', () => {
    const cancelled = marginNotice28SepCancelled();
    const text = shareText(noticeCard(cancelled, 'cancelled', now), site);
    expect(text).toBe(
      'Stood down: Grid notice 16:00–19:00 today. NESO has cancelled the Electricity Margin Notice. No action needed.\n\n' +
        `${site}/notices/emn-20260927T232600Z`,
    );
  });

  it('keeps every kind of post short enough for Bluesky and never alarmist', () => {
    const kinds: NoticeKind[] = ['EMN', 'CMN', 'HRDR', 'DCI', 'DCRP'];
    for (const kind of kinds) {
      const notice: Notice = {
        id: `${kind.toLowerCase()}-20261201T160000Z`,
        kind,
        window: { start: '2026-12-01T17:00:00Z', end: '2026-12-01T19:30:00Z' },
        shortfallMW: 1400,
        cancelled: false,
        history: [{ type: 'issued', at: '2026-12-01T16:00:00Z' }],
        source: { name: 'x' },
      };
      for (const change of ['issued', 'updated', 'cancelled'] as const) {
        const text = shareText(noticeCard(notice, change, new Date('2026-12-01T16:05:00Z')), site);
        expect([...text].length, `${kind} ${change}`).toBeLessThanOrEqual(300);
        expect(text).not.toMatch(/!|blackout|chaos|brace/i);
      }
    }
  });

  it('shares a calm all-clear when nothing is in force', () => {
    const snapshot = buildScenario('calm', now);
    const card = nationalCard(snapshot, new Date(snapshot.generatedAt));
    expect(card.headline).toBe('Nothing to report');
    expect(shareText(card, site)).toMatch(/^Nothing to report\. No NESO warnings in force\./);
  });
});

describe('topic broadcast', () => {
  const emn = buildScenario('emn-2026-09-28', now).notices[0]!;

  it('sends margin notices only to people who asked for every notice', () => {
    expect(noticeBroadcast({ type: 'notice', change: 'issued', notice: emn }, now)?.audience).toEqual(['everything']);
  });

  it('sends stand-downs to the same people as the original', () => {
    const cancelled = marginNotice28SepCancelled();
    const b = noticeBroadcast({ type: 'notice', change: 'cancelled', notice: cancelled }, now);
    expect(b?.audience).toEqual(['everything']);
    expect(b?.alert.title).toBe('Stood down: grid notice');
  });

  it('sends imminent demand control to everyone, and rotations to heads-up and above', () => {
    const dci = { ...emn, kind: 'DCI' as const, id: 'dci-1' };
    const dcrp = { ...emn, kind: 'DCRP' as const, id: 'dcrp-1' };
    expect(noticeBroadcast({ type: 'notice', change: 'issued', notice: dci }, now)?.audience).toEqual(['essential', 'balanced', 'everything']);
    expect(noticeBroadcast({ type: 'notice', change: 'issued', notice: dcrp }, now)?.audience).toEqual(['balanced', 'everything']);
  });

  it('does not push updates', () => {
    expect(noticeBroadcast({ type: 'notice', change: 'updated', notice: emn }, now)).toBeNull();
  });
});
