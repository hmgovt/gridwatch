import { describe, expect, it } from 'vitest';
import {
  activeNotices,
  buildNotices,
  classifyWarning,
  noticeState,
  parseShortfall,
  parseWarning,
  parseWindow,
  type ParsedWarning,
} from '../src/notices.ts';
import { atUkTime } from '../src/time.ts';

// The messages below are synthetic, written in the style of published system
// warnings. VERIFY against real SYSWARN records once the live feed is connected.
const source = { name: 'NESO via Elexon' };

function warning(publishTime: string, text: string, warningType = 'SYSTEM WARNING'): ParsedWarning {
  const parsed = parseWarning({ publishTime, warningType, warningText: text });
  if (!parsed) throw new Error('unparseable');
  return parsed;
}

describe('classifying warnings', () => {
  it.each([
    ['ELECTRICITY MARGIN NOTICE issued for 16:00 to 19:00', 'EMN', false],
    ['NATIONAL GRID NOTIFICATION of INADEQUATE SYSTEM MARGIN', 'EMN', false],
    ['CAPACITY MARKET NOTICE for settlement period 35', 'CMN', false],
    ['HIGH RISK OF DEMAND REDUCTION between 17:00 and 19:00', 'HRDR', false],
    ['DEMAND CONTROL IMMINENT', 'DCI', false],
    ['Demand Control Rotation Protocol invoked for blocks A B C', 'DCRP', false],
    ['The Electricity Margin Notice issued at 00:57 has been cancelled', 'EMN', true],
    ['Negative Reserve Active Power Margin', null, false],
  ])('%s', (text, kind, cancelled) => {
    expect(classifyWarning(undefined, text)).toEqual({ kind, isCancellation: cancelled });
  });

  it('does not mistake a conditional for a cancellation', () => {
    expect(classifyWarning(undefined, 'EMN issued. This notice may be cancelled later.').isCancellation).toBe(false);
  });
});

describe('reading windows and shortfalls', () => {
  const published = new Date('2026-09-27T23:57:00Z');

  it('reads a window on the same UK day as publication', () => {
    const w = parseWindow('for the period 16:00 to 19:00', published)!;
    expect(w.start.toISOString()).toBe('2026-09-28T15:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-09-28T18:00:00.000Z');
  });

  it('prefers an explicit date', () => {
    const w = parseWindow('from 1600 hrs to 1900 hrs on 29/09/2026', published)!;
    expect(w.start.toISOString()).toBe('2026-09-29T15:00:00.000Z');
  });

  it('rolls a past window forward to the next day', () => {
    const late = new Date('2026-09-28T21:30:00Z');
    const w = parseWindow('between 16:00 and 19:00', late)!;
    expect(w.start.toISOString()).toBe('2026-09-29T15:00:00.000Z');
  });

  it('handles windows that cross midnight', () => {
    const w = parseWindow('22:00 - 01:00', published)!;
    expect(w.end.getTime() - w.start.getTime()).toBe(3 * 3600_000);
  });

  it('does not read a date as a time window', () => {
    expect(parseWindow('issued on 28/09/2026 for the evening', published)).toBeUndefined();
  });

  it('reads the stated shortfall', () => {
    expect(parseShortfall('a system margin shortfall of 1,400MW for the period')).toBe(1400);
    expect(parseShortfall('shortfall is now 104 MW')).toBe(104);
    expect(parseShortfall('no figure given')).toBeUndefined();
  });
});

describe('building notice lifecycles', () => {
  it('follows the 28 September 2026 notice from issue to cancellation', () => {
    const notices = buildNotices(
      [
        warning('2026-09-27T23:57:00Z', 'ELECTRICITY MARGIN NOTICE. Shortfall of 1,400MW for the period 16:00 to 19:00 on 28/09/2026'),
        warning('2026-09-28T11:42:00Z', 'ELECTRICITY MARGIN NOTICE revised. Shortfall of 104MW for the period 16:00 to 19:00 on 28/09/2026'),
        warning('2026-09-28T14:58:00Z', 'The ELECTRICITY MARGIN NOTICE for 16:00 to 19:00 on 28/09/2026 has been cancelled'),
      ],
      source,
    );
    expect(notices).toHaveLength(1);
    const [emn] = notices;
    expect(emn?.kind).toBe('EMN');
    expect(emn?.history.map((e) => e.type)).toEqual(['issued', 'updated', 'cancelled']);
    expect(emn?.shortfallMW).toBe(104);
    expect(emn?.cancelled).toBe(true);
    expect(emn?.id).toBe('emn-20260927T235700Z');
    expect(noticeState(emn!, atUkTime('2026-09-28', '17:00'))).toBe('cancelled');
  });

  it('keeps separate windows on the same day as separate notices', () => {
    const notices = buildNotices(
      [
        warning('2026-12-01T05:00:00Z', 'ELECTRICITY MARGIN NOTICE for 07:00 to 09:00'),
        warning('2026-12-01T12:00:00Z', 'ELECTRICITY MARGIN NOTICE for 16:30 to 19:00'),
      ],
      source,
    );
    expect(notices).toHaveLength(2);
    expect(activeNotices(notices, new Date('2026-12-01T12:30:00Z'))).toHaveLength(1);
  });

  it('records a cancellation even if the original notice was missed', () => {
    const notices = buildNotices([warning('2026-12-01T12:00:00Z', 'CAPACITY MARKET NOTICE cancelled')], source);
    expect(notices[0]?.cancelled).toBe(true);
    expect(notices[0]?.history[0]?.type).toBe('cancelled');
  });

  it('ignores repeated identical messages', () => {
    const text = 'HIGH RISK OF DEMAND REDUCTION between 17:00 and 19:00';
    const notices = buildNotices([warning('2026-12-01T12:00:00Z', text), warning('2026-12-01T12:05:00Z', text), warning('2026-12-01T12:10:00Z', text)], source);
    expect(notices[0]?.history.map((e) => e.type)).toEqual(['issued']);
  });

  it('ends a notice when its window has passed', () => {
    const [n] = buildNotices([warning('2026-12-01T12:00:00Z', 'ELECTRICITY MARGIN NOTICE for 16:30 to 19:00')], source);
    expect(noticeState(n!, new Date('2026-12-01T18:00:00Z'))).toBe('active');
    expect(noticeState(n!, new Date('2026-12-01T19:01:00Z'))).toBe('ended');
  });
});
