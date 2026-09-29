import { brand } from '../brand.ts';

/** One cycle of a sine wave on its baseline, ending in a live dot. Same drawing as the app icon. */
function sinePath(x0: number, x1: number, cy: number, amp: number): string {
  const steps = 32;
  const pts = Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    return `${(x0 + (x1 - x0) * t).toFixed(2)},${(cy - amp * Math.sin(t * Math.PI * 2)).toFixed(2)}`;
  });
  return `M${pts[0]} L${pts.slice(1).join(' ')}`;
}

const MARK_PATH = sinePath(5, 25, 16, 7);

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="logo-mark">
      <line x1="3" y1="16" x2="28" y2="16" className="logo-base" />
      <path d={MARK_PATH} className="logo-wave" />
      <circle cx="25" cy="16" r="2.6" className="logo-dot" />
    </svg>
  );
}

/** "everybody Hz", letter-spaced, with the unit set apart. */
export function Wordmark() {
  const [word, unit] = brand.name.split(' ');
  return (
    <span className="wordmark">
      <LogoMark />
      <span className="wordmark-text">
        {word}
        <span className="wordmark-unit">{unit}</span>
      </span>
    </span>
  );
}
