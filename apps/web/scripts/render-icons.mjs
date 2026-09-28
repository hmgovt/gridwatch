/**
 * Rasterise the SVG app icons into the PNG sizes browsers and app stores need.
 * Run: pnpm icons
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './browser.mjs';

const icons = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const jobs = [
  ['icon.svg', 'icon-192.png', 192],
  ['icon.svg', 'icon-512.png', 512],
  ['maskable.svg', 'maskable-512.png', 512],
  ['maskable.svg', 'apple-touch-icon.png', 180],
  ['badge.svg', 'badge-72.png', 72],
];

const browser = await launch();
const page = await browser.newPage();
for (const [source, target, size] of jobs) {
  const svg = readFileSync(join(icons, source), 'utf8');
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: join(icons, target), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log(`wrote ${target}`);
}
await browser.close();
