import { AnimatePresence, motion } from 'motion/react';
import { useMemo } from 'react';
import {
  activeNotices,
  formatClock,
  NATIONAL_LEVELS,
  PERSONAL_LEVELS,
  settlementPeriodOf,
  startOfUkDay,
  type NationalLevel,
  type PersonalStatus,
  type RotaLetter,
  type StatusSnapshot,
  NOTICE_KINDS,
} from '@gridwatch/core';

/*
 * The day as a 24-hour dial: one tick per half-hour settlement period.
 * Lanes, from the outside in: hour labels, ticks, evening peak (dotted),
 * your household track (elapsed day, your block's window, now), and the
 * national notice lane (highest level in force at each moment).
 */
const SIZE = 400;
const C = SIZE / 2;
const R = { label: 190, tickOuter: 176, tick: 170, tickHour: 166, tickMajor: 160, peak: 150, track: 132, notices: 112 } as const;
const DAY_MIN = 1440;

function polar(r: number, minutes: number): [number, number] {
  const a = (minutes / DAY_MIN) * Math.PI * 2 - Math.PI / 2;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

function arcPath(r: number, from: number, to: number): string {
  const span = Math.min(to - from, DAY_MIN - 0.01);
  const [x0, y0] = polar(r, from);
  const [x1, y1] = polar(r, from + span);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${span > DAY_MIN / 2 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/** Minutes into the UK day that starts at `dayStart`, clipped to the dial. */
function clip(dayStart: Date, start: string, end: string): [number, number] | null {
  const from = Math.max(0, (new Date(start).getTime() - dayStart.getTime()) / 60_000);
  const to = Math.min(DAY_MIN, (new Date(end).getTime() - dayStart.getTime()) / 60_000);
  return to > from ? [from, to] : null;
}

interface Segment {
  from: number;
  to: number;
  level: Exclude<NationalLevel, 0>;
}

/** Split the day into segments showing the highest notice level in force at each moment. */
export function noticeSegments(snapshot: StatusSnapshot, now: Date, dayStart: Date): Segment[] {
  const spans: Segment[] = [];
  for (const notice of activeNotices(snapshot.notices, now)) {
    if (!notice.window) continue;
    const span = clip(dayStart, notice.window.start, notice.window.end);
    if (span) spans.push({ from: span[0], to: span[1], level: NOTICE_KINDS[notice.kind].level });
  }
  const edges = [...new Set(spans.flatMap((s) => [s.from, s.to]))].toSorted((a, b) => a - b);
  const out: Segment[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const from = edges[i]!;
    const to = edges[i + 1]!;
    const level = Math.max(0, ...spans.filter((s) => s.from < to && s.to > from).map((s) => s.level));
    if (level === 0) continue;
    const last = out[out.length - 1];
    if (last && last.level === level && last.to === from) last.to = to;
    else out.push({ from, to, level: level as Segment['level'] });
  }
  return out;
}

export interface RingProps {
  snapshot: StatusSnapshot;
  status: PersonalStatus;
  now: Date;
  letter: RotaLetter | null;
}

export function StatusRing({ snapshot, status, now, letter }: RingProps) {
  const dayStart = useMemo(() => startOfUkDay(now), [now]);
  const nowMin = (now.getTime() - dayStart.getTime()) / 60_000;
  const sp = settlementPeriodOf(now);
  const segments = useMemo(() => noticeSegments(snapshot, now, dayStart), [snapshot, now, dayStart]);
  const focus = useMemo(() => {
    if (!status.focusWindow || !status.focusWindow.label.startsWith('Block')) return null;
    return clip(dayStart, status.focusWindow.start, status.focusWindow.end);
  }, [status.focusWindow, dayStart]);

  const ticks = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => {
        const minutes = i * 30;
        const major = minutes % 360 === 0;
        const hour = minutes % 60 === 0;
        const [x0, y0] = polar(major ? R.tickMajor : hour ? R.tickHour : R.tick, minutes);
        const [x1, y1] = polar(R.tickOuter, minutes);
        return { i, x0, y0, x1, y1, major, current: i + 1 === sp };
      }),
    [sp],
  );

  const [nx, ny] = polar(R.track, nowMin);
  const label = PERSONAL_LEVELS[status.level].label;
  const described = [
    `Today, now ${formatClock(now)}, settlement period ${sp}.`,
    ...segments.map((s) => `${NATIONAL_LEVELS[s.level].name} ${clock(s.from)} to ${clock(s.to)}.`),
    focus ? `${status.focusWindow?.label} ${clock(focus[0])} to ${clock(focus[1])}.` : '',
  ].join(' ');

  return (
    <figure className={`ring lvl-${status.level}`}>
      <div className="ring-glow" aria-hidden="true" />
      {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- inline SVG is exposed as one image with a text description */}
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="ring-svg" role="img" aria-label={described}>
        <g className="ring-ticks">
          {ticks.map((t) => (
            <line
              key={t.i}
              x1={t.x0}
              y1={t.y0}
              x2={t.x1}
              y2={t.y1}
              className={t.current ? 'tick tick-now' : t.major ? 'tick tick-major' : 'tick'}
              style={{ ['--i' as string]: t.i }}
            />
          ))}
        </g>
        {['00', '06', '12', '18'].map((h, i) => {
          const [x, y] = polar(R.label, i * 360);
          return (
            <text key={h} x={x} y={y} className="ring-hour" textAnchor="middle" dominantBaseline="central">
              {h}
            </text>
          );
        })}

        <path d={arcPath(R.peak, 16 * 60, 19 * 60)} className="ring-peak" />
        <circle cx={C} cy={C} r={R.track} className="ring-track" />
        <path d={arcPath(R.track, 0, Math.max(nowMin, 0.1))} className="ring-elapsed" />
        <circle cx={C} cy={C} r={R.notices} className="ring-lane" />

        {segments.map((s) => (
          <motion.path
            key={`${s.level}-${s.from}`}
            d={arcPath(R.notices, s.from, s.to)}
            className={`arc-notice nat-${s.level}`}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1], delay: 0.1 + s.level * 0.08 }}
          />
        ))}

        {focus && (
          <g className="arc-focus">
            <path d={arcPath(R.track, focus[0], focus[1])} className="arc-halo" />
            <motion.path
              d={arcPath(R.track, focus[0], focus[1])}
              className="arc-line"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1], delay: 0.3 }}
            />
          </g>
        )}

        <g className="ring-now" transform={`translate(${nx.toFixed(2)} ${ny.toFixed(2)})`}>
          <circle r="8" className="now-halo" />
          <motion.circle r="8" className="now-dot" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 18, delay: 0.5 }} />
        </g>
      </svg>

      <div className="ring-centre" aria-live="polite">
        <span className="ring-kicker mono">{letter ? `Block ${letter}` : 'Your home'}</span>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.strong
            key={label}
            className="ring-word"
            initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
            transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {label}
          </motion.strong>
        </AnimatePresence>
        <span className="ring-time mono tabular">
          {formatClock(now)} <span aria-hidden="true">·</span> SP {sp}
        </span>
      </div>
    </figure>
  );
}

function clock(m: number): string {
  const total = Math.round(m) % DAY_MIN;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Text key for the dial, so nothing on it relies on colour alone. */
export function RingLegend({ snapshot, status, now }: RingProps) {
  const dayStart = startOfUkDay(now);
  const segments = noticeSegments(snapshot, now, dayStart);
  const byLevel = new Map<number, { from: number; to: number }>();
  for (const s of segments) {
    const existing = byLevel.get(s.level);
    byLevel.set(s.level, existing ? { from: Math.min(existing.from, s.from), to: Math.max(existing.to, s.to) } : { from: s.from, to: s.to });
  }
  const items: Array<{ key: string; className: string; text: string }> = [];
  if (status.focusWindow && status.focusWindow.label.startsWith('Block')) {
    items.push({
      key: 'focus',
      className: `legend-swatch legend-focus lvl-${status.level}`,
      text: `${status.focusWindow.label} ${formatClock(new Date(status.focusWindow.start))}–${formatClock(new Date(status.focusWindow.end))}`,
    });
  }
  for (const [level, span] of [...byLevel.entries()].toSorted((a, b) => b[0] - a[0])) {
    items.push({
      key: `level-${level}`,
      className: `legend-swatch legend-notice nat-${level}`,
      text: `${NATIONAL_LEVELS[level as NationalLevel].name} ${clock(span.from)}–${clock(span.to)}`,
    });
  }
  items.push({ key: 'peak', className: 'legend-swatch legend-peak', text: 'Evening peak' });

  return (
    <ul className="ring-legend">
      {items.map((item) => (
        <li key={item.key}>
          <span className={item.className} aria-hidden="true" />
          {item.text}
        </li>
      ))}
    </ul>
  );
}
