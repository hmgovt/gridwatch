import { describe, expect, it } from 'vitest';
import { alertFor } from '../src/alerts.ts';
import { assessPersonal, nationalLevelOf } from '../src/status.ts';
import { buildScenario, marginNotice28SepCancelled } from '../src/scenarios.ts';
import type { StatusSnapshot } from '../src/types.ts';

const realNow = new Date('2026-12-01T09:00:00Z');
const at = (s: StatusSnapshot) => new Date(s.scenario!.at);

describe('personal status', () => {
  it('is all clear on a calm evening', () => {
    const s = buildScenario('calm', realNow);
    const status = assessPersonal(s, { rotaLetter: 'C' }, at(s));
    expect(status.level).toBe('clear');
    expect(status.national).toBe(0);
  });

  it('keeps households all clear during a margin notice', () => {
    const s = buildScenario('emn-2026-09-28', realNow);
    const status = assessPersonal(s, { rotaLetter: 'C' }, at(s));
    expect(status.level).toBe('clear');
    expect(status.headline).toBe('All clear for you');
    expect(status.national).toBe(1);
    expect(status.focusWindow?.label).toBe('Grid notice');
  });

  it('gives a heads-up when there is a high risk of demand reduction', () => {
    const s = buildScenario('hrdr', realNow);
    const status = assessPersonal(s, { rotaLetter: null }, at(s));
    expect(status.level).toBe('headsup');
    expect(status.national).toBe(2);
    expect(status.summary).toContain('between 17:00 and 19:00');
  });

  it('tells a scheduled block to get ready, with its times', () => {
    const s = buildScenario('rotation', realNow);
    const status = assessPersonal(s, { rotaLetter: 'C' }, at(s));
    expect(status.level).toBe('prepare');
    expect(status.headline).toBe('Block C: off 16:30–19:30 today');
    expect(nationalLevelOf(s, at(s))).toBe(4);
  });

  it('says power is off while the block is in its window', () => {
    const s = buildScenario('rotation-live', realNow);
    const status = assessPersonal(s, { rotaLetter: 'C' }, at(s));
    expect(status.level).toBe('off');
    expect(status.headline).toBe('Block C is off until 19:30');
  });

  it('reassures blocks that are not on the rota', () => {
    const s = buildScenario('rotation', realNow);
    expect(assessPersonal(s, { rotaLetter: 'K' }, at(s)).level).toBe('headsup');
  });

  it('asks for a rota letter when rotations are planned and it is unknown', () => {
    const s = buildScenario('rotation', realNow);
    const status = assessPersonal(s, {}, at(s));
    expect(status.level).toBe('prepare');
    expect(status.nudge).toBeDefined();
  });

  it('refuses to guess when live data is hours old', () => {
    const s: StatusSnapshot = {
      ...buildScenario('calm', realNow),
      mode: 'live',
      sources: [{ id: 'syswarn', label: 'Warnings', ok: false, lastSuccessAt: '2026-12-01T01:00:00Z' }],
    };
    expect(assessPersonal(s, {}, new Date('2026-12-01T09:00:00Z')).level).toBe('unknown');
  });
});

describe('alert rules', () => {
  const now = new Date('2026-09-28T12:00:00Z');
  const emn = buildScenario('emn-2026-09-28', realNow).notices[0]!;

  it('does not push margin notices unless asked for everything', () => {
    expect(alertFor({ type: 'notice', change: 'issued', notice: emn }, { sensitivity: 'balanced' }, now)).toBeNull();
    const alert = alertFor({ type: 'notice', change: 'issued', notice: emn }, { sensitivity: 'everything' }, now);
    expect(alert?.body).toContain('Not a warning of power cuts');
  });

  it('closes the loop when a notice is cancelled', () => {
    const cancelled = marginNotice28SepCancelled();
    const alert = alertFor({ type: 'notice', change: 'cancelled', notice: cancelled }, { sensitivity: 'everything' }, now);
    expect(alert?.title).toBe('Stood down: grid notice');
    expect(alert?.tag).toBe(`notice-${cancelled.id}`);
  });

  it('pushes imminent demand control to everyone', () => {
    const dci = { ...emn, id: 'dci-1', kind: 'DCI' as const };
    expect(alertFor({ type: 'notice', change: 'issued', notice: dci }, { sensitivity: 'essential' }, now)?.urgency).toBe('high');
  });

  it('tells a scheduled block exactly when it is off', () => {
    const s = buildScenario('rotation', realNow);
    const alert = alertFor({ type: 'rotation', change: 'announced', rotation: s.rotation! }, { sensitivity: 'essential', rotaLetter: 'C' }, at(s));
    expect(alert?.title).toBe('Block C: power off 16:30–19:30 today');
    expect(alert?.urgency).toBe('high');
  });

  it('only tells unscheduled blocks if they want heads-ups', () => {
    const s = buildScenario('rotation', realNow);
    const event = { type: 'rotation' as const, change: 'announced' as const, rotation: s.rotation! };
    expect(alertFor(event, { sensitivity: 'essential', rotaLetter: 'K' }, at(s))).toBeNull();
    expect(alertFor(event, { sensitivity: 'balanced', rotaLetter: 'K' }, at(s))?.title).toBe('Rotating cuts planned, not your block');
  });

  it('asks people without a letter to add one', () => {
    const s = buildScenario('rotation', realNow);
    const alert = alertFor({ type: 'rotation', change: 'announced', rotation: s.rotation! }, { sensitivity: 'essential' }, at(s));
    expect(alert?.url).toBe('/settings');
  });
});
