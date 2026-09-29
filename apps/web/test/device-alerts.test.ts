import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A stand-in for the object Capacitor's registerPlugin returns: a Proxy that
 * answers *every* property, including `then`, with a native method call. If
 * our code ever resolves a promise with it, the promise machinery calls
 * `plugin.then()` on the phone, which never settles, and "Turn on alerts"
 * hangs. That was the bug on the first test build.
 */
const calls: string[] = [];
const native: Record<string, (...args: unknown[]) => Promise<unknown>> = {
  requestPermissions: async () => ({ notifications: 'granted' }),
  configure: async () => undefined,
  testAlert: async () => undefined,
  openSettings: async () => undefined,
  status: async () => ({ enabled: true, permission: 'granted', lastCheckAt: null, lastResult: null }),
};
const capacitorLikePlugin = new Proxy(
  {},
  {
    get(_target, prop: string) {
      return (...args: unknown[]) => {
        calls.push(prop);
        const fn = native[prop];
        // Like Capacitor: an unknown method rejects its own promise and ignores the callbacks it was given.
        return fn ? fn(...args) : Promise.reject(new Error(`"GridAlerts.${prop}()" is not implemented on android`));
      };
    },
  },
);

vi.mock('../src/platform/native.ts', () => ({ GridAlerts: capacitorLikePlugin }));

const { deviceAlerts } = await import('../src/platform/alerts.ts');

const settings = { rotaLetter: null, sensitivity: 'balanced' } as const;
const withTimeout = <T,>(p: Promise<T>) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('hung')), 500))]);

describe('device alerts (Android)', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('turns alerts on without hanging', async () => {
    await expect(withTimeout(deviceAlerts.enable(settings))).resolves.toEqual({ id: 'device', token: '' });
    expect(calls).toEqual(['requestPermissions', 'configure']);
  });

  it('never calls then() on the plugin', async () => {
    await withTimeout(deviceAlerts.update({ id: 'device', token: '' }, settings));
    await withTimeout(deviceAlerts.test({ id: 'device', token: '' }));
    await withTimeout(deviceAlerts.disable(null));
    expect(calls).not.toContain('then');
  });

  it('explains a refusal instead of failing silently', async () => {
    native.requestPermissions = async () => ({ notifications: 'denied' });
    await expect(withTimeout(deviceAlerts.enable(settings))).rejects.toThrow(/turned off/);
  });
});
