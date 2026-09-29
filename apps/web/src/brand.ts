/**
 * Product naming lives here and in public/manifest.webmanifest, index.html and
 * the Android app (capacitor.config.ts, android/app/src/main/res/values/strings.xml).
 * Change them together. The name is always lowercase "everybody", capital-H "Hz".
 */
export const brand = {
  name: 'everybody Hz',
  tagline: 'Power cut early warning, in plain English',
  description:
    'Early warning of power disruption in Great Britain: NESO’s grid notices, rotating power cuts, and what they mean for your home.',
} as const;
