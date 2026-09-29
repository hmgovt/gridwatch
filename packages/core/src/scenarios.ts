import { addDaysToKey, atUkTime, durations, ukDayKey } from './time.ts';
import type { HeadroomPoint, Notice, NoticeEvent, NoticeKind, RotationSchedule, StatusSnapshot } from './types.ts';
import { noticesFrom } from './live.ts';
import { noticeId } from './notices.ts';
import { EMN_28_SEP_HEADROOM, EMN_28_SEP_WARNINGS } from './replay-2026-09-28.ts';

/**
 * Scenario snapshots for previews, demos, design reviews and tests. They use
 * exactly the same shape as live data, and are always labelled in the UI.
 * One scenario replays a real event from NESO's published messages; the rest
 * are hypothetical and say so.
 */

export interface ScenarioDefinition {
  id: string;
  label: string;
  build(today: string): StatusSnapshot;
}

export const SCENARIOS: ScenarioDefinition[] = [
  { id: 'calm', label: 'Calm evening', build: calm },
  { id: 'emn-2026-09-28', label: 'Margin notice, 28 Sep', build: () => marginNotice28Sep() },
  { id: 'hrdr', label: 'Risk of controlled cuts', build: highRisk },
  { id: 'rotation', label: 'Rotating cuts planned', build: (today) => rotation(today, '10:20') },
  { id: 'rotation-live', label: 'Your block is off', build: (today) => rotation(today, '17:40') },
];

export function buildScenario(id: string, realNow: Date = new Date()): StatusSnapshot {
  const definition = SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0]!;
  return definition.build(ukDayKey(realNow));
}

// ---------------------------------------------------------------------------

function calm(today: string): StatusSnapshot {
  const at = atUkTime(today, '18:05');
  return snapshot({
    at,
    id: 'calm',
    title: 'Calm evening',
    description: 'A typical evening peak with plenty of spare capacity.',
    hypothetical: true,
    notices: [],
    headroom: curve(today, '18:00', 24, [
      ['18:00', 5200], ['19:00', 5600], ['21:00', 6900], ['23:00', 7800], ['02:00', 8600], ['05:30', 8200], ['07:30', 6400], ['09:00', 6100], ['11:30', 6800],
    ]),
    hz: 50.02,
  });
}

/** 13:20 BST on 28 September 2026: after NESO's midday update, before the cancellation. */
const REPLAY_AT = new Date('2026-09-28T12:20:00Z');

function marginNotice28Sep(): StatusSnapshot {
  const known = EMN_28_SEP_WARNINGS.filter((w) => w.publishTime <= REPLAY_AT.toISOString());
  return snapshot({
    at: REPLAY_AT,
    id: 'emn-2026-09-28',
    title: 'Margin notice, 28 Sep 2026',
    description:
      'Replay of a real Electricity Margin Notice, shown at 13:20 after NESO’s midday update. NESO cancelled it at 15:00. The forecast is the one published at the time.',
    hypothetical: false,
    sourceNote: 'NESO’s messages and forecast as published on Elexon BMRS.',
    notices: noticesFrom(known, REPLAY_AT),
    headroom: EMN_28_SEP_HEADROOM.map(([start, mw, horizon]) => ({
      start: new Date(start).toISOString(),
      settlementPeriod: settlementPeriodOf(new Date(start)),
      deratedMarginMW: mw,
      lossOfLoadProbability: 0,
      horizonHours: horizon,
    })),
    // Measured at 12:20:00 UTC that day.
    hz: 49.974,
  });
}

/** The same notice after NESO cancelled it, for the lifecycle view and tests. */
export function marginNotice28SepCancelled(): Notice {
  return noticesFrom(EMN_28_SEP_WARNINGS, new Date('2026-09-28T16:00:00Z'))[0]!;
}

/** Half-hour settlement period of a UK day (ignores the 46/50-period clock-change days). */
function settlementPeriodOf(start: Date): number {
  const midnight = atUkTime(ukDayKey(start), '00:00').getTime();
  return Math.floor((start.getTime() - midnight) / (30 * durations.MINUTE)) + 1;
}

function highRisk(today: string): StatusSnapshot {
  const at = atUkTime(today, '14:10');
  const source = { name: 'Hypothetical scenario' };
  return snapshot({
    at,
    id: 'hrdr',
    title: 'Risk of controlled cuts',
    description: 'A cold, still evening with low wind, several power stations offline and imports running flat out.',
    hypothetical: true,
    notices: [
      notice('EMN', today, '07:45', ['16:30', '19:30'], 1900, source),
      notice('CMN', today, '13:10', ['17:00', '17:30'], undefined, source),
      notice('HRDR', today, '13:55', ['17:00', '19:00'], undefined, source),
    ],
    headroom: curve(today, '14:00', 20, [
      ['14:00', 1800], ['16:00', 700], ['17:00', 250], ['17:30', 180], ['18:00', 240], ['19:00', 600], ['20:00', 1200], ['21:00', 1900], ['22:00', 2600], ['23:30', 3000],
    ]),
    hz: 49.93,
  });
}

function rotation(today: string, clock: string): StatusSnapshot {
  const at = atUkTime(today, clock);
  const source = { name: 'Hypothetical scenario' };
  const schedule: RotationSchedule = {
    announcedAt: atUkTime(today, '08:40').toISOString(),
    source,
    windows: [
      { blocks: ['A', 'B', 'C'], start: atUkTime(today, '16:30').toISOString(), end: atUkTime(today, '19:30').toISOString() },
      { blocks: ['D', 'E', 'F'], start: atUkTime(today, '17:30').toISOString(), end: atUkTime(today, '20:30').toISOString() },
      { blocks: ['G', 'H', 'J'], start: atUkTime(today, '18:30').toISOString(), end: atUkTime(today, '21:30').toISOString() },
    ],
  };
  const live = clock >= '16:30';
  return snapshot({
    at,
    id: live ? 'rotation-live' : 'rotation',
    title: live ? 'Your block is off' : 'Rotating cuts planned',
    description:
      'NESO uses the Demand Control Rotation Protocol after a prolonged shortfall. Blocks take turns to be off for 3 hours.',
    hypothetical: true,
    notices: [
      notice('EMN', today, '07:10', ['16:00', '21:00'], 2600, source),
      notice('HRDR', today, '07:55', ['16:00', '21:00'], undefined, source),
      notice('DCRP', today, '08:40', ['16:30', '21:30'], undefined, source),
    ],
    headroom: curve(today, live ? '17:30' : '10:00', 20, [
      ['10:00', 1400], ['13:00', 900], ['15:00', 450], ['16:30', 180], ['17:30', 150], ['18:30', 190], ['19:30', 320], ['21:00', 700], ['23:00', 1500], ['01:00', 2400], ['04:00', 2900], ['07:00', 1900], ['09:00', 1500], ['13:30', 1300],
    ]),
    rotation: schedule,
    hz: 49.96,
  });
}

// ---------------------------------------------------------------------------

function notice(
  kind: NoticeKind,
  day: string,
  issuedAt: string,
  window: [string, string],
  shortfallMW: number | undefined,
  source: { name: string; url?: string },
): Notice {
  const issued = atUkTime(day, issuedAt);
  const w = { start: atUkTime(day, window[0]).toISOString(), end: atUkTime(day, window[1]).toISOString() };
  const event: NoticeEvent = { type: 'issued', at: issued.toISOString(), window: w };
  const n: Notice = { id: noticeId(kind, issued), kind, window: w, cancelled: false, source, history: [event] };
  if (shortfallMW !== undefined) {
    event.shortfallMW = shortfallMW;
    n.shortfallMW = shortfallMW;
  }
  return n;
}

/**
 * Half-hourly headroom from a few key points (linear in between), with a loss
 * of load probability that rises steeply as margin falls. Illustrative only.
 */
function curve(day: string, from: string, hours: number, keys: Array<[string, number]>): HeadroomPoint[] {
  const start = atUkTime(day, from).getTime();
  const anchors: Array<[number, number]> = [];
  let dayKey = day;
  let previous = -Infinity;
  for (const [hhmm, mw] of keys) {
    let t = atUkTime(dayKey, hhmm).getTime();
    if (t < previous) {
      dayKey = addDaysToKey(dayKey, 1);
      t = atUkTime(dayKey, hhmm).getTime();
    }
    previous = t;
    anchors.push([t, mw]);
  }
  const points: HeadroomPoint[] = [];
  for (let i = 0; i < hours * 2; i++) {
    const t = start + i * 30 * durations.MINUTE;
    const mw = interpolate(anchors, t);
    points.push({
      start: new Date(t).toISOString(),
      settlementPeriod: settlementPeriodFor(new Date(t)),
      deratedMarginMW: Math.round(mw / 10) * 10,
      lossOfLoadProbability: Math.min(0.5, 0.5 * Math.exp(-Math.max(mw, 0) / 250)),
      horizonHours: i < 2 ? 1 : i < 4 ? 2 : i < 8 ? 4 : i < 16 ? 8 : 12,
    });
  }
  return points;
}

function settlementPeriodFor(date: Date): number {
  const midnight = atUkTime(ukDayKey(date), '00:00').getTime();
  return Math.floor((date.getTime() - midnight) / (30 * durations.MINUTE)) + 1;
}

function interpolate(anchors: Array<[number, number]>, t: number): number {
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (!first || !last) return 0;
  if (t <= first[0]) return first[1];
  if (t >= last[0]) return last[1];
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1]!;
    const b = anchors[i]!;
    if (t <= b[0]) return a[1] + ((b[1] - a[1]) * (t - a[0])) / (b[0] - a[0]);
  }
  return last[1];
}

function snapshot(input: {
  at: Date;
  id: string;
  title: string;
  description: string;
  hypothetical: boolean;
  sourceNote?: string;
  notices: Notice[];
  headroom: HeadroomPoint[];
  rotation?: RotationSchedule;
  hz: number;
}): StatusSnapshot {
  const at = input.at.toISOString();
  return {
    generatedAt: at,
    mode: 'scenario',
    notices: input.notices,
    headroom: input.headroom,
    rotation: input.rotation ?? null,
    frequency: { at, hz: input.hz },
    sources: [{ id: 'scenario', label: 'Scenario data', ok: true, lastSuccessAt: at, lastAttemptAt: at }],
    scenario: {
      id: input.id,
      title: input.title,
      description: input.description,
      hypothetical: input.hypothetical,
      at,
      ...(input.sourceNote ? { sourceNote: input.sourceNote } : {}),
    },
  };
}
