/**
 * Screenshot the built app with production security headers applied
 * (`vite preview`), in light and dark, phone and desktop. Also reports
 * console errors and Content-Security-Policy violations.
 *
 * Usage: node scripts/screenshots.mjs <outDir> [baseUrl]
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './browser.mjs';

const out = process.argv[2] ?? 'screenshots';
const base = process.argv[3] ?? 'http://127.0.0.1:4173';
mkdirSync(out, { recursive: true });

const shots = [
  { name: 'phone-now-emn', path: '/?scenario=emn-2026-09-28', viewport: 'phone', scheme: 'light', full: true },
  { name: 'phone-now-rotation', path: '/?scenario=rotation', viewport: 'phone', scheme: 'light', letter: 'C' },
  { name: 'phone-now-off-dark', path: '/?scenario=rotation-live', viewport: 'phone', scheme: 'dark', letter: 'C' },
  { name: 'phone-now-hrdr-dark', path: '/?scenario=hrdr', viewport: 'phone', scheme: 'dark', full: true },
  { name: 'phone-notice-detail', path: '/notices/emn-20260927T232600Z?scenario=emn-2026-09-28', viewport: 'phone', scheme: 'light', full: true },
  { name: 'phone-learn', path: '/learn?scenario=calm', viewport: 'phone', scheme: 'light', full: true },
  { name: 'phone-settings-dark', path: '/settings?scenario=calm', viewport: 'phone', scheme: 'dark', full: true },
  { name: 'phone-onboarding', path: '/', viewport: 'phone', scheme: 'light', fresh: true },
  { name: 'desktop-now-emn', path: '/?scenario=emn-2026-09-28', viewport: 'desktop', scheme: 'light' },
  { name: 'desktop-now-hrdr-dark', path: '/?scenario=hrdr', viewport: 'desktop', scheme: 'dark' },
  { name: 'desktop-learn-dark', path: '/learn?scenario=emn-2026-09-28', viewport: 'desktop', scheme: 'dark', full: true },
];

const VIEWPORTS = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1 },
};

const browser = await launch();
const problems = [];
for (const shot of shots) {
  const context = await browser.newContext({ ...VIEWPORTS[shot.viewport], colorScheme: shot.scheme, reducedMotion: 'no-preference' });
  if (shot.letter) {
    await context.addInitScript((letter) => {
      const key = 'gw:prefs.v1';
      const prefs = JSON.parse(localStorage.getItem(key) ?? '{}');
      localStorage.setItem(key, JSON.stringify({ ...prefs, rotaLetter: letter, onboarded: true }));
    }, shot.letter);
  }
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') problems.push(`[${shot.name}] ${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', (err) => problems.push(`[${shot.name}] pageerror: ${err.message}`));
  await page.goto(base + shot.path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200); // let entrance animations settle
  await page.screenshot({ path: join(out, `${shot.name}.png`), fullPage: !!shot.full });
  console.log(`shot ${shot.name}`);
  await context.close();
}
await browser.close();
console.log(problems.length ? `\nProblems:\n${problems.join('\n')}` : '\nNo console errors or CSP violations.');
