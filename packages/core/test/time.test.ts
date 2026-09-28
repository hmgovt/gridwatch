import { describe, expect, it } from 'vitest';
import {
  addDaysToKey,
  atUkTime,
  formatClock,
  formatDuration,
  formatRelative,
  formatWindow,
  minutesIntoUkDay,
  settlementPeriodOf,
  ukDayKey,
  ukOffsetMinutes,
} from '../src/time.ts';

describe('UK time', () => {
  it('knows British Summer Time from GMT', () => {
    expect(ukOffsetMinutes(new Date('2026-07-01T12:00:00Z'))).toBe(60);
    expect(ukOffsetMinutes(new Date('2026-12-01T12:00:00Z'))).toBe(0);
  });

  it('builds instants from UK local clock times either side of a clock change', () => {
    expect(atUkTime('2026-09-28', '16:00').toISOString()).toBe('2026-09-28T15:00:00.000Z');
    expect(atUkTime('2026-12-14', '16:00').toISOString()).toBe('2026-12-14T16:00:00.000Z');
    // Clocks go back at 02:00 BST on 25 Oct 2026.
    expect(atUkTime('2026-10-25', '00:30').toISOString()).toBe('2026-10-24T23:30:00.000Z');
    expect(atUkTime('2026-10-25', '12:00').toISOString()).toBe('2026-10-25T12:00:00.000Z');
  });

  it('formats in UK time regardless of the machine time zone', () => {
    const date = new Date('2026-09-27T23:57:00Z');
    expect(formatClock(date)).toBe('00:57');
    expect(ukDayKey(date)).toBe('2026-09-28');
    expect(minutesIntoUkDay(date)).toBe(57);
  });

  it('counts settlement periods from UK midnight', () => {
    expect(settlementPeriodOf(atUkTime('2026-09-28', '00:10'))).toBe(1);
    expect(settlementPeriodOf(atUkTime('2026-09-28', '16:00'))).toBe(33);
    expect(settlementPeriodOf(atUkTime('2026-09-28', '23:59'))).toBe(48);
  });

  it('writes windows and durations the way people say them', () => {
    const now = atUkTime('2026-09-28', '13:20');
    expect(formatWindow(atUkTime('2026-09-28', '16:00'), atUkTime('2026-09-28', '19:00'), now)).toBe('16:00–19:00 today');
    expect(formatWindow(atUkTime('2026-09-29', '16:00'), atUkTime('2026-09-29', '19:00'), now)).toBe('16:00–19:00 tomorrow');
    expect(formatWindow(atUkTime('2026-10-02', '07:00'), atUkTime('2026-10-02', '09:00'), now)).toBe('Fri 2 Oct, 07:00–09:00');
    expect(formatDuration(45 * 60_000)).toBe('45 min');
    expect(formatDuration(135 * 60_000)).toBe('2 h 15 min');
    expect(formatRelative(atUkTime('2026-09-28', '16:00'), now)).toBe('in 2 h 40 min');
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01');
  });
});
