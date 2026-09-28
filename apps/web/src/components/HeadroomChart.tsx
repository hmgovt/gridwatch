import { motion } from 'motion/react';
import { useId, useMemo, useState, type PointerEvent } from 'react';
import { formatClock, formatOdds, formatPower, summariseHeadroom, ukParts, type HeadroomPoint } from '@gridwatch/core';
import { useWidth } from '../lib/useWidth.ts';

const HEIGHT = 196;
const M = { top: 18, right: 14, bottom: 28, left: 44 };
const HALF_HOUR = 30 * 60_000;

export function HeadroomChart({ points, now, hours = 12 }: { points: HeadroomPoint[]; now: Date; hours?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>(340);
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();

  const series = useMemo(() => {
    const from = now.getTime() - HALF_HOUR;
    const to = now.getTime() + hours * 3600_000;
    return points.filter((p) => {
      const t = new Date(p.start).getTime();
      return t >= from && t < to;
    });
  }, [points, now, hours]);

  const summary = useMemo(() => summariseHeadroom(series, now), [series, now]);

  if (series.length < 2) {
    return (
      <div className="chart-empty">
        <p>No capacity forecast has been published for the next few hours yet.</p>
      </div>
    );
  }

  const t0 = new Date(series[0]!.start).getTime();
  const t1 = new Date(series[series.length - 1]!.start).getTime() + HALF_HOUR;
  const values = series.map((p) => p.deratedMarginMW);
  const maxV = Math.max(...values);
  const minV = Math.min(...values);
  const step = maxV > 6000 ? 2000 : 1000;
  const yMax = Math.max(step * 2, Math.ceil((maxV * 1.08) / step) * step);
  const yMin = Math.min(0, Math.floor(minV / step) * step);
  const plotW = Math.max(120, width - M.left - M.right);
  const plotH = HEIGHT - M.top - M.bottom;
  const x = (t: number) => M.left + ((t - t0) / (t1 - t0)) * plotW;
  const y = (v: number) => M.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;
  const mid = (p: HeadroomPoint) => new Date(p.start).getTime() + HALF_HOUR / 2;

  const line = series.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(mid(p)).toFixed(1)} ${y(p.deratedMarginMW).toFixed(1)}`).join(' ');
  const area = `${line} L ${x(mid(series[series.length - 1]!)).toFixed(1)} ${y(Math.max(0, yMin))} L ${x(mid(series[0]!)).toFixed(1)} ${y(Math.max(0, yMin))} Z`;

  const yTicks: number[] = [];
  for (let v = yMin; v <= yMax; v += step) yTicks.push(v);

  const xTicks: number[] = [];
  for (let t = Math.ceil(t0 / 3600_000) * 3600_000; t <= t1; t += 3600_000) {
    const p = ukParts(new Date(t));
    if (p.minute === 0 && p.hour % 3 === 0) xTicks.push(t);
  }

  const tightestIndex = summary ? series.indexOf(summary.tightest) : -1;
  const tightest = tightestIndex >= 0 ? series[tightestIndex] : undefined;
  const active = hover !== null ? series[hover] : undefined;

  const pick = (clientX: number, rect: DOMRect) => {
    const px = clientX - rect.left;
    let best = 0;
    let bestDist = Infinity;
    series.forEach((p, i) => {
      const d = Math.abs(x(mid(p)) - px);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    setHover(best);
  };

  const tooltipLeft = active ? Math.min(Math.max(x(mid(active)), M.left + 70), width - 80) : 0;

  return (
    <div className="chart">
      <div
        ref={ref}
        className="chart-frame"
        onPointerMove={(e: PointerEvent<HTMLDivElement>) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerDown={(e: PointerEvent<HTMLDivElement>) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setHover(null)}
      >
        <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} className="chart-svg" aria-hidden="true">
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={M.left} x2={width - M.right} y1={y(v)} y2={y(v)} className={v === 0 ? 'chart-baseline' : 'chart-grid'} />
              <text x={M.left - 8} y={y(v)} className="chart-tick" textAnchor="end" dominantBaseline="central">
                {v === 0 ? '0' : `${v / 1000} GW`}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={t} x={x(t)} y={HEIGHT - 8} className="chart-tick" textAnchor="middle">
              {formatClock(new Date(t))}
            </text>
          ))}

          <motion.path d={area} className="chart-area" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.3 }} />
          <motion.path
            d={line}
            className="chart-line"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.1, ease: [0.2, 0.8, 0.2, 1] }}
          />

          {tightest && (
            <g className="chart-min">
              <circle cx={x(mid(tightest))} cy={y(tightest.deratedMarginMW)} r={5} />
              {(() => {
                // The lowest point sits in a dip, so the space above it is clear of the line.
                const py = y(tightest.deratedMarginMW);
                const above = py - M.top > 30;
                return (
                  <text
                    x={Math.min(Math.max(x(mid(tightest)), M.left + 56), width - M.right - 56)}
                    y={above ? py - 14 : py + 22}
                    textAnchor="middle"
                    className="chart-min-label"
                  >
                    Lowest {formatPower(tightest.deratedMarginMW)}
                  </text>
                );
              })()}
            </g>
          )}

          {active && (
            <g className="chart-cross">
              <line x1={x(mid(active))} x2={x(mid(active))} y1={M.top} y2={HEIGHT - M.bottom} />
              <circle cx={x(mid(active))} cy={y(active.deratedMarginMW)} r={5} />
            </g>
          )}
        </svg>

        {active && (
          <div className="chart-tip" style={{ left: tooltipLeft }} aria-hidden="true">
            <strong>{formatPower(active.deratedMarginMW)}</strong>
            <span>
              {formatClock(new Date(active.start))} · SP {active.settlementPeriod}
            </span>
            <span className="chart-tip-odds">Shortfall risk {formatOdds(active.lossOfLoadProbability)}</span>
          </div>
        )}

        {/* Keyboard and screen reader access: a native slider that steps through the half-hours. */}
        <input
          type="range"
          className="chart-scrubber"
          min={0}
          max={series.length - 1}
          step={1}
          value={hover ?? Math.max(0, tightestIndex)}
          aria-label="Explore spare capacity by half-hour"
          aria-describedby={showTable ? tableId : undefined}
          aria-valuetext={(() => {
            const p = series[hover ?? Math.max(0, tightestIndex)]!;
            return `${formatClock(new Date(p.start))}, ${formatPower(p.deratedMarginMW)} spare, shortfall risk ${formatOdds(p.lossOfLoadProbability)}`;
          })()}
          onChange={(e) => setHover(Number(e.target.value))}
          onFocus={() => setHover((h) => h ?? Math.max(0, tightestIndex))}
          onBlur={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setHover(null);
          }}
        />
      </div>

      <div className="chart-foot">
        {summary && (
          <p className="muted">
            Tightest at <strong className="tabular">{formatClock(new Date(summary.tightest.start))}</strong>, with{' '}
            {formatPower(summary.tightest.deratedMarginMW)} to spare. Chance demand can’t be met then:{' '}
            {formatOdds(summary.tightest.lossOfLoadProbability)}.
          </p>
        )}
        <button type="button" className="btn btn-quiet" aria-expanded={showTable} aria-controls={tableId} onClick={() => setShowTable((v) => !v)}>
          {showTable ? 'Hide table' : 'Show as table'}
        </button>
      </div>

      {showTable && (
        <div className="table-wrap" id={tableId}>
          <table className="data-table">
            <caption className="visually-hidden">Spare capacity by half-hour</caption>
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">SP</th>
                <th scope="col">Spare capacity</th>
                <th scope="col">Shortfall risk</th>
              </tr>
            </thead>
            <tbody>
              {series.map((p) => (
                <tr key={p.start}>
                  <td className="tabular">{formatClock(new Date(p.start))}</td>
                  <td className="tabular">{p.settlementPeriod}</td>
                  <td className="tabular">{p.deratedMarginMW.toLocaleString('en-GB')} MW</td>
                  <td>{formatOdds(p.lossOfLoadProbability)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
