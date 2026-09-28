import { describe, expect, it } from 'vitest';
import { buildScenario, startOfUkDay } from '@gridwatch/core';
import { noticeSegments } from '../src/components/StatusRing.tsx';
import { parseRoute } from '../src/router.tsx';

describe('day ring notice lane', () => {
  it('shows the highest level in force at each moment, without overlaps', () => {
    const snapshot = buildScenario('hrdr', new Date('2026-12-01T09:00:00Z'));
    const now = new Date(snapshot.scenario!.at);
    const segments = noticeSegments(snapshot, now, startOfUkDay(now));
    // EMN 16:30-19:30 (level 1), CMN 17:00-17:30 (level 1), HRDR 17:00-19:00 (level 2)
    expect(segments.map((s) => [s.from / 60, s.to / 60, s.level])).toEqual([
      [16.5, 17, 1],
      [17, 19, 2],
      [19, 19.5, 1],
    ]);
  });

  it('is empty on a calm day', () => {
    const snapshot = buildScenario('calm', new Date('2026-12-01T09:00:00Z'));
    const now = new Date(snapshot.scenario!.at);
    expect(noticeSegments(snapshot, now, startOfUkDay(now))).toEqual([]);
  });
});

describe('routes', () => {
  it.each([
    ['/', { name: 'now' }],
    ['/notices/', { name: 'notices' }],
    ['/notices/emn-20260927T235700Z', { name: 'notice', id: 'emn-20260927T235700Z' }],
    ['/learn', { name: 'learn' }],
    ['/settings', { name: 'settings' }],
    ['/notices/<script>', { name: 'not-found' }],
    ['/admin', { name: 'not-found' }],
  ])('%s', (path, route) => {
    expect(parseRoute(path)).toEqual(route);
  });
});
