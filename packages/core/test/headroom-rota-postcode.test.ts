import { describe, expect, it } from 'vitest';
import { buildHeadroom, formatOdds, formatPower, summariseHeadroom } from '../src/headroom.ts';
import { currentOrNextWindow, isRotaLetter, ROTA_LETTERS } from '../src/rota.ts';
import { coverageOf, toOutwardCode } from '../src/postcode.ts';
import { atUkTime } from '../src/time.ts';
import type { RotationSchedule } from '../src/types.ts';

describe('headroom', () => {
  it('keeps the most recent forecast for each half-hour', () => {
    const points = buildHeadroom([
      { publishTime: '2026-09-28T06:00:00Z', startTime: '2026-09-28T16:30:00Z', settlementPeriod: 36, forecastHorizon: 12, lossOfLoadProbability: 0.001, deratedMargin: 2500 },
      { publishTime: '2026-09-28T14:30:00Z', startTime: '2026-09-28T16:30:00Z', settlementPeriod: 36, forecastHorizon: 2, lossOfLoadProbability: 0.01, deratedMargin: 1200.4 },
      { publishTime: '2026-09-28T14:30:00Z', startTime: '2026-09-28T16:00:00Z', settlementPeriod: 35, forecastHorizon: 1, lolp: 0.002, deRatedMargin: 1800 },
      { publishTime: '2026-09-28T14:30:00Z', settlementDate: '2026-09-28', settlementPeriod: 38, forecastHorizon: 4, lossOfLoadProbability: 0.0001, deratedMargin: 3000 },
      { publishTime: 'bad', startTime: '2026-09-28T19:00:00Z', lossOfLoadProbability: Number.NaN, deratedMargin: 10 },
    ]);
    expect(points.map((p) => p.deratedMarginMW)).toEqual([1800, 1200, 3000]);
    expect(points[2]?.start).toBe(atUkTime('2026-09-28', '18:30').toISOString());
    const summary = summariseHeadroom(points, new Date('2026-09-28T15:00:00Z'));
    expect(summary?.tightest.deratedMarginMW).toBe(1200);
    expect(summary?.peakLolp.lossOfLoadProbability).toBe(0.01);
  });

  it('formats power and odds for people', () => {
    expect(formatPower(4234)).toBe('4.2 GW');
    expect(formatPower(850)).toBe('850 MW');
    expect(formatOdds(0.00001)).toBe('less than 1 in 10,000');
    expect(formatOdds(0.004)).toBe('about 1 in 250');
    expect(formatOdds(0.00042)).toBe('about 1 in 2,400');
  });
});

describe('rota blocks', () => {
  const schedule: RotationSchedule = {
    announcedAt: '2026-12-01T08:40:00Z',
    source: { name: 'test' },
    windows: [
      { blocks: ['A', 'C'], start: '2026-12-01T16:30:00Z', end: '2026-12-01T19:30:00Z' },
      { blocks: ['C', 'D'], start: '2026-12-02T16:30:00Z', end: '2026-12-02T19:30:00Z' },
    ],
  };

  it('has 18 letters', () => {
    expect(ROTA_LETTERS).toHaveLength(18);
    expect(isRotaLetter('C')).toBe(true);
    expect(isRotaLetter('I')).toBe(false);
  });

  it('finds the current or next window for a block', () => {
    expect(currentOrNextWindow(schedule, 'C', new Date('2026-12-01T10:00:00Z'))).toMatchObject({ current: false });
    expect(currentOrNextWindow(schedule, 'C', new Date('2026-12-01T17:00:00Z'))).toMatchObject({ current: true });
    expect(currentOrNextWindow(schedule, 'C', new Date('2026-12-01T20:00:00Z'))?.window.start).toBe('2026-12-02T16:30:00Z');
    expect(currentOrNextWindow(schedule, 'B', new Date('2026-12-01T10:00:00Z'))).toBeNull();
  });
});

describe('postcodes', () => {
  it.each([
    ['sw1a 1aa', 'SW1A'],
    ['SW1A1AA', 'SW1A'],
    ['m1', 'M1'],
    ['  eh1  ', 'EH1'],
    ['CR0 2YR', 'CR0'],
    ['not a postcode', null],
    ['12345', null],
  ])('%s -> %s', (input, expected) => {
    expect(toOutwardCode(input)).toBe(expected);
  });

  it('knows which areas are on the GB grid', () => {
    expect(coverageOf('SW1A')).toBe('gb');
    expect(coverageOf('BT7')).toBe('northern-ireland');
    expect(coverageOf('JE2')).toBe('crown-dependency');
  });
});
