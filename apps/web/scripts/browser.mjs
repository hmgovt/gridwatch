import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

/** Launch Chromium: a local install if one is configured, else Playwright's managed browser. */
export async function launch() {
  const candidates = [
    process.env.CHROMIUM_PATH,
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  ].filter(Boolean);
  const executablePath = candidates.find((p) => existsSync(p));
  return chromium.launch(executablePath ? { executablePath } : {});
}
