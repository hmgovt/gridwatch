import type { PersonalLevel } from '@gridwatch/core';

const W = 640;
const H = 64;
const CY = H / 2;
const AMP = 17;
/** Wavelength at exactly 50 Hz: five cycles across the strip. */
const L0 = W / 5;
/** Pixels per second the wave travels. */
const SPEED = 110;

/**
 * Wavelength for a frequency, exaggerated so a real deviation is visible:
 * 0.1 Hz off stretches or squeezes the wave by 16%. A picture, not a scale.
 */
function wavelength(hz: number): number {
  const factor = Math.min(1.6, Math.max(0.6, 1 + (50 - hz) * 1.6));
  return L0 * factor;
}

/** Shape by household level: steady when all is well, unsettled as things tighten, flat when the power is off. */
function y(x: number, lambda: number, level: PersonalLevel): number {
  if (level === 'off') return CY;
  const phase = (x / lambda) * Math.PI * 2;
  let v = Math.sin(phase);
  if (level === 'headsup') v *= 1 - 0.22 * (0.5 + 0.5 * Math.sin(phase / 3));
  if (level === 'prepare') v = v * (1 - 0.4 * (0.5 + 0.5 * Math.sin(phase / 3))) + 0.16 * Math.sin(phase * 3);
  return CY - AMP * v;
}

/**
 * A path one loop-period wider than the strip. It travels from -period to 0,
 * so the strip always shows x in [0, W + period], and the shape repeats every
 * `period`, so the jump back is invisible.
 */
function path(lambda: number, period: number, level: PersonalLevel): string {
  const step = 4;
  const parts: string[] = [];
  for (let x = 0; x <= W + period + step; x += step) parts.push(`${x.toFixed(1)},${y(x, lambda, level).toFixed(1)}`);
  return `M${parts[0]} L${parts.slice(1).join(' ')}`;
}

function describe(hz: number): string {
  const off = Math.abs(hz - 50);
  if (off <= 0.05) return 'steady';
  if (off <= 0.2) return hz < 50 ? 'a little low, within limits' : 'a little high, within limits';
  return 'outside normal limits';
}

/**
 * The 50 Hz line. A faint reference wave runs at exactly 50 Hz; the live wave
 * runs at the measured frequency, so any drift shows as the two falling out of
 * step. Decorative: the numbers beside it carry the meaning.
 */
export function HzWave({ hz, level, label }: { hz: number | null; level: PersonalLevel; label: string }) {
  const lambda = hz === null ? L0 : wavelength(hz);
  // Loop after three wavelengths, the period of the heads-up and get-ready wobble.
  const period = lambda * 3;
  const refPeriod = L0 * 3;
  return (
    <div className={`hzwave lvl-${level}`}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="hzwave-svg" aria-hidden="true">
        <line x1={0} y1={CY} x2={W} y2={CY} className="hzwave-base" />
        <g className="hzwave-travel" style={{ ['--shift' as string]: `${refPeriod}px`, ['--dur' as string]: `${refPeriod / SPEED}s` }}>
          <path d={path(L0, refPeriod, 'clear')} className="hzwave-ref" />
        </g>
        <g className="hzwave-travel" style={{ ['--shift' as string]: `${period}px`, ['--dur' as string]: `${period / SPEED}s` }}>
          <path d={path(lambda, period, level)} className="hzwave-live" />
        </g>
      </svg>
      <p className="hzwave-readout">
        <span className="hzwave-label">{label}</span>
        {hz === null ? (
          <span className="hzwave-value muted">no reading</span>
        ) : (
          <span className="hzwave-value">
            <strong className="tabular">{hz.toFixed(2)}</strong> Hz <span className="muted">· {level === 'off' ? 'your supply is off' : describe(hz)}</span>
          </span>
        )}
      </p>
    </div>
  );
}
