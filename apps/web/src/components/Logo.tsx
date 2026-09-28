import { brand } from '../brand.ts';

/** The mark: a day ring with an evening marker. Echoes the status ring. */
export function LogoMark({ size = 28 }: { size?: number }) {
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    return { x1: 16 + 11.5 * Math.cos(a), y1: 16 + 11.5 * Math.sin(a), x2: 16 + 14 * Math.cos(a), y2: 16 + 14 * Math.sin(a) };
  });
  const evening = (18 / 24) * Math.PI * 2 - Math.PI / 2;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="logo-mark">
      <circle cx="16" cy="16" r="8" className="logo-track" />
      {ticks.map((t, i) => (
        <line key={i} {...t} className="logo-tick" />
      ))}
      <path d={`M 16 8 A 8 8 0 1 1 ${16 + 8 * Math.cos(evening)} ${16 + 8 * Math.sin(evening)}`} className="logo-arc" />
      <circle cx={16 + 8 * Math.cos(evening)} cy={16 + 8 * Math.sin(evening)} r="2.6" className="logo-dot" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark">
      <LogoMark />
      <span>{brand.name}</span>
    </span>
  );
}
