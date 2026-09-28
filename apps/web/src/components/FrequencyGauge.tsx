import { useEffect, useState } from 'react';
import type { FrequencyReading } from '@gridwatch/core';

const MIN = 49.5;
const MAX = 50.5;
const CX = 110;
const CY = 104;
const R = 84;

function point(hz: number, r = R): [number, number] {
  const f = (Math.min(MAX, Math.max(MIN, hz)) - MIN) / (MAX - MIN);
  const a = Math.PI + f * Math.PI;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

function band(from: number, to: number, r = R): string {
  const [x0, y0] = point(from, r);
  const [x1, y1] = point(to, r);
  return `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`;
}

/** System frequency: the grid's pulse. 50 Hz means supply and demand are balanced. */
export function FrequencyGauge({ reading }: { reading: FrequencyReading }) {
  const target = ((Math.min(MAX, Math.max(MIN, reading.hz)) - MIN) / (MAX - MIN)) * 180 - 90;
  // Start from the left stop so the needle swings into place on first render.
  const [angle, setAngle] = useState(-90);
  useEffect(() => {
    const id = requestAnimationFrame(() => setAngle(target));
    return () => cancelAnimationFrame(id);
  }, [target]);
  const normal = reading.hz >= 49.8 && reading.hz <= 50.2;
  return (
    <div className="gauge">
      {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- inline SVG exposed as one image */}
      <svg viewBox="0 -18 220 146" className="gauge-svg" role="img" aria-label={`System frequency ${reading.hz.toFixed(2)} hertz, ${normal ? 'within' : 'outside'} the normal range of 49.8 to 50.2.`}>
        <path d={band(MIN, MAX)} className="gauge-track" />
        <path d={band(49.8, 50.2)} className="gauge-normal" />
        {[49.5, 50, 50.5].map((hz) => {
          const [x0, y0] = point(hz, R + 9);
          const [x1, y1] = point(hz, R + 15);
          const [tx, ty] = point(hz, R + 27);
          return (
            <g key={hz}>
              <line x1={x0} y1={y0} x2={x1} y2={y1} className="gauge-tick" />
              <text x={hz < 50 ? tx + 6 : hz > 50 ? tx - 6 : tx} y={hz === 50 ? ty + 2 : ty + 16} textAnchor={hz < 50 ? 'start' : hz > 50 ? 'end' : 'middle'} className="gauge-label">
                {hz.toFixed(1)}
              </text>
            </g>
          );
        })}
        <g className="gauge-needle-g" style={{ transform: `rotate(${angle}deg)` }}>
          <line x1={CX} y1={CY} x2={CX} y2={CY - R + 12} className="gauge-needle" />
        </g>
        <circle cx={CX} cy={CY} r={5} className="gauge-hub" />
      </svg>
      <div className="gauge-readout">
        <span className="gauge-value">
          {reading.hz.toFixed(2)}
          <small> Hz</small>
        </span>
        <span className="muted">{normal ? 'Normal range' : 'Outside normal range'}</span>
      </div>
    </div>
  );
}
