import type { SVGProps } from 'react';

/** A small hand-drawn icon set: 24px grid, 1.75px strokes, round caps. */
const PATHS = {
  clear: <><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.6 2.6L16.2 9.4" /></>,
  headsup: <><path d="M12 3.5 21 19.5H3z" /><path d="M12 10v4.2" /><path d="M12 17.1v.1" /></>,
  prepare: <><rect x="3" y="7.5" width="15" height="9" rx="2" /><path d="M21 10.5v3" /><path d="m11.2 9.2-2.2 3h3l-2.2 3" /></>,
  off: <><path d="M12 3v8" /><path d="M6.6 6.6a8 8 0 1 0 10.8 0" /></>,
  unknown: <><circle cx="12" cy="12" r="9" /><path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6" /><path d="M12 16.9v.1" /></>,
  now: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  notices: <><path d="M5 5.5h14" /><path d="M5 12h14" /><path d="M5 18.5h9" /></>,
  learn: <><path d="M4 5.5c2.5-1 5.5-1 8 .8 2.5-1.8 5.5-1.8 8-.8v13c-2.5-1-5.5-1-8 .8-2.5-1.8-5.5-1.8-8-.8z" /><path d="M12 6.3v13" /></>,
  settings: <><path d="M4 7h9" /><path d="M17 7h3" /><circle cx="15" cy="7" r="2" /><path d="M4 17h3" /><path d="M11 17h9" /><circle cx="9" cy="17" r="2" /></>,
  chevron: <path d="m9.5 6 6 6-6 6" />,
  back: <path d="m14.5 6-6 6 6 6" />,
  external: <><path d="M14 5h5v5" /><path d="M19 5 11 13" /><path d="M17 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4" /></>,
  close: <><path d="m6 6 12 12" /><path d="M18 6 6 18" /></>,
  phone: <path d="M6.5 3.5h2.8l1.4 4-2 1.3a11 11 0 0 0 6.5 6.5l1.3-2 4 1.4v2.8a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2z" />,
  bell: <><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
  shield: <><path d="M12 3.5 19 6v5.5c0 4.3-2.9 7.8-7 9-4.1-1.2-7-4.7-7-9V6z" /><path d="m9 12 2.2 2.2L15.3 10" /></>,
  bolt: <path d="M13 3 5.5 13.5H12L11 21l7.5-10.5H12z" />,
  wave: <path d="M3 12c1.5-4 3-6 4.5-6s3 4 4.5 6 3 6 4.5 6 3-2 4.5-6" />,
  trash: <><path d="M4.5 7h15" /><path d="M9.5 7V4.5h5V7" /><path d="M6.5 7l1 12.5h9l1-12.5" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>,
  moon: <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />,
  system: <><rect x="3.5" y="4.5" width="17" height="12" rx="2" /><path d="M9 20h6" /><path d="M12 16.5V20" /></>,
  layers: <><path d="m12 3.5 8.5 4.5-8.5 4.5L3.5 8z" /><path d="m3.5 12.5 8.5 4.5 8.5-4.5" /></>,
  check: <path d="m5.5 12.5 4.2 4.2 8.8-9.2" />,
  sparkle: <path d="M12 3.5c.7 4.3 2.2 5.8 6.5 6.5-4.3.7-5.8 2.2-6.5 6.5-.7-4.3-2.2-5.8-6.5-6.5 4.3-.7 5.8-2.2 6.5-6.5z" />,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></>,
  refresh: <><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" /><path d="M19.5 4.5v4h-4" /></>,
  share: <><path d="M12 3.5v11" /><path d="m7.5 8 4.5-4.5L16.5 8" /><path d="M6 12.5v6a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5v-6" /></>,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = 'icon', ...rest }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}

export const LEVEL_ICON: Record<string, IconName> = {
  clear: 'clear',
  headsup: 'headsup',
  prepare: 'prepare',
  off: 'off',
  unknown: 'unknown',
};
