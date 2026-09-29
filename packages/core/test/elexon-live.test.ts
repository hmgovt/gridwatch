import { describe, expect, it } from 'vitest';
import lolpdrmFixture from '../../../services/api/test/fixtures/lolpdrm.json' with { type: 'json' };
import historyFixture from './fixtures/syswarn-history.json' with { type: 'json' };
import {
  assessPersonal,
  buildLiveSnapshot,
  FeedFormatError,
  noticesFrom,
  parseFrequency,
  parseLossOfLoad,
  parseSystemWarnings,
  parseWarning,
  sanitiseText,
} from '../src/index.ts';

/** Real SYSWARN records, May 2023 to September 2026 (routine trade and IT messages trimmed to a sample). */
const history = parseSystemWarnings(historyFixture);

describe('real system warnings', () => {
  it('parses every record in the archive', () => {
    expect(history.length).toBe(173);
    expect(history.every((w) => parseWarning(w) !== null)).toBe(true);
  });

  it('only classifies margin and capacity market notices, never routine messages', () => {
    for (const warning of history) {
      const parsed = parseWarning(warning)!;
      const type = warning.warningType ?? '';
      if (type === 'ELECTRICITY MARGIN NOTICE') expect(parsed.kind).toBe('EMN');
      else if (type === 'CAPACITY MARKET NOTICE') expect(parsed.kind).toBe('CMN');
      else expect(parsed.kind, `${type} at ${warning.publishTime}`).toBeNull();
    }
  });

  it('threads the 28 September 2026 margin notice: issued, updated, cancelled', () => {
    const now = new Date('2026-09-28T16:00:00Z');
    const notice = noticesFrom(history, now).find((n) => n.id === 'emn-20260927T232600Z')!;
    expect(notice.history.map((e) => [e.type, e.at, e.shortfallMW])).toEqual([
      ['issued', '2026-09-27T23:26:00.000Z', 1400],
      ['updated', '2026-09-28T11:00:00.000Z', 104],
      ['cancelled', '2026-09-28T14:02:00.000Z', undefined],
    ]);
    // 16:00 to 19:00 UK time (BST).
    expect(notice.window).toEqual({ start: '2026-09-28T15:00:00.000Z', end: '2026-09-28T18:00:00.000Z' });
    expect(notice.cancelled).toBe(true);
  });

  it('closes every margin notice in the archive with its cancellation', () => {
    const now = new Date('2026-09-29T12:00:00Z');
    const notices = noticesFrom(history, now, 4 * 365 * 24 * 3600_000).filter((n) => n.kind === 'EMN');
    expect(notices).toHaveLength(6);
    for (const n of notices) {
      expect(n.window, n.id).toBeDefined();
      expect(n.history.at(-1)?.type, n.id).toBe('cancelled');
    }
  });

  it('keeps the official wording readable: real line breaks, no literal \\n', () => {
    const emn = history.find((w) => w.publishTime === '2026-09-28T11:00:00Z')!;
    const text = sanitiseText(emn.warningText);
    expect(text).not.toMatch(/\\[nr]/);
    expect(text.split('\n')[0]).toBe('From : Power System Manager – NESO Electricity Control Centre');
    expect(text).toContain('System margin shortfall 104 MW');
  });
});

describe('feed parsers', () => {
  it('reads frequency readings and drops impossible values', () => {
    const readings = parseFrequency({
      data: [
        { measurementTime: '2026-09-29T14:40:15Z', frequency: 50.061 },
        { measurementTime: '2026-09-29T14:40:00Z', frequency: 50.046 },
        { measurementTime: '2026-09-29T14:40:30Z', frequency: 5000 },
      ],
    });
    expect(readings).toEqual([
      { at: '2026-09-29T14:40:00.000Z', hz: 50.046 },
      { at: '2026-09-29T14:40:15.000Z', hz: 50.061 },
    ]);
  });

  it('fails loudly when a feed changes shape', () => {
    expect(() => parseLossOfLoad({ items: [] })).toThrow(FeedFormatError);
    expect(() => parseSystemWarnings({ data: [{ published: 'x', text: 'y' }] })).toThrow(FeedFormatError);
    expect(parseSystemWarnings({ data: [] })).toEqual([]);
  });
});

describe('live snapshot', () => {
  const lossOfLoad = parseLossOfLoad(lolpdrmFixture);

  it('shows the notice in force at lunchtime on 28 September, and all clear for households', () => {
    const now = new Date('2026-09-28T12:20:00Z');
    const snapshot = buildLiveSnapshot(
      {
        warnings: history.filter((w) => w.publishTime <= now.toISOString()),
        lossOfLoad,
        frequency: [
          { at: '2026-09-28T12:15:00.000Z', hz: 50.02 },
          { at: '2026-09-28T12:19:45.000Z', hz: 49.98 },
        ],
        rotation: null,
        sources: [{ id: 'syswarn', label: 'x', ok: true, critical: true, lastSuccessAt: now.toISOString() }],
      },
      now,
    );
    expect(snapshot.notices.map((n) => [n.kind, n.shortfallMW, n.cancelled])).toEqual([['EMN', 104, false]]);
    expect(snapshot.frequency).toEqual({ at: '2026-09-28T12:19:45.000Z', hz: 49.98 });
    expect(snapshot.frequencyTrace).toHaveLength(2);
    expect(snapshot.headroom.length).toBeGreaterThan(0);
    const status = assessPersonal(snapshot, { rotaLetter: 'A' }, now);
    expect(status.level).toBe('clear');
    expect(status.national).toBe(1);
  });
});
