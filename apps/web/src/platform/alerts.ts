import type { RotaLetter, Sensitivity } from '@gridwatch/core';
import { api } from '../data/api.ts';
import type { BackgroundStatus, GridAlertsPlugin } from './native.ts';
import { webPush, type PushSupport } from './push.ts';

/**
 * Where alerts come from. On the web the server pushes them (Web Push). In the
 * native app the device checks NESO's warnings itself in the background and
 * raises local notifications, so no server or push token is involved.
 */
export interface AlertRegistration {
  id: string;
  token: string;
}

export interface AlertSettings {
  rotaLetter: RotaLetter | null;
  sensitivity: Sensitivity;
}

export interface AlertService {
  /** `server`: pushed by our service. `device`: checked on the phone. */
  kind: 'server' | 'device' | 'none';
  support(): PushSupport;
  enable(settings: AlertSettings): Promise<AlertRegistration>;
  /** Returns false when the registration no longer exists and should be forgotten. */
  update(registration: AlertRegistration, settings: AlertSettings): Promise<boolean>;
  disable(registration: AlertRegistration | null): Promise<void>;
  /** Sends a sample alert; resolves to a short result for the user. */
  test(registration: AlertRegistration): Promise<string>;
  /** Native only: open this app's notification settings. */
  openSystemSettings?(): Promise<void>;
  /** Native only: what the background check last did. */
  backgroundStatus?(): Promise<BackgroundStatus>;
}

export const serverAlerts: AlertService = {
  kind: 'server',
  support: () => webPush.support(),
  async enable(settings) {
    const { publicKey } = await api.publicKey();
    const subscription = await webPush.subscribe(publicKey);
    return api.subscribe(subscription, settings);
  },
  async update(registration, settings) {
    try {
      await api.updatePrefs(registration.id, registration.token, settings);
      return true;
    } catch (e) {
      return !(e && typeof e === 'object' && 'status' in e && e.status === 401);
    }
  },
  async disable(registration) {
    if (registration) await api.unsubscribe(registration.id, registration.token).catch(() => undefined);
    await webPush.unsubscribe();
  },
  async test(registration) {
    const { result } = await api.testAlert(registration.id, registration.token);
    return result;
  },
};

/**
 * Run `use` with the native plugin, loaded on demand so web builds never
 * include the bridge. The plugin must never be the value a promise resolves
 * to: Capacitor's plugin object answers every property, `then` included, so a
 * promise would treat it as a thenable and wait forever on a native `then()`.
 * It stays inside the module object and this callback.
 */
async function withPlugin<T>(use: (plugin: GridAlertsPlugin) => Promise<T>): Promise<T> {
  const native = await import('./native.ts');
  return use(native.GridAlerts);
}

export const deviceAlerts: AlertService = {
  kind: 'device',
  support: () => 'supported',
  enable: (settings) =>
    withPlugin(async (plugin) => {
      const { notifications } = await plugin.requestPermissions();
      if (notifications !== 'granted') throw new Error('Notifications are turned off for everybody Hz. Allow them in Android settings.');
      await plugin.configure({ enabled: true, sensitivity: settings.sensitivity });
      return { id: 'device', token: '' };
    }),
  update: (_registration, settings) =>
    withPlugin(async (plugin) => {
      await plugin.configure({ enabled: true, sensitivity: settings.sensitivity });
      return true;
    }),
  disable: () => withPlugin((plugin) => plugin.configure({ enabled: false, sensitivity: 'balanced' })),
  test: () =>
    withPlugin(async (plugin) => {
      await plugin.testAlert();
      return 'sent';
    }),
  openSystemSettings: () => withPlugin((plugin) => plugin.openSettings()),
  backgroundStatus: () => withPlugin((plugin) => plugin.status()),
};

export const noAlerts: AlertService = {
  kind: 'none',
  support: () => 'unsupported',
  enable: () => Promise.reject(new Error('Alerts are not available in this preview')),
  update: () => Promise.resolve(false),
  disable: () => Promise.resolve(),
  test: () => Promise.resolve('unavailable'),
};
