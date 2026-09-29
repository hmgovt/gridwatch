import type { RotaLetter, Sensitivity } from '@gridwatch/core';
import { api } from '../data/api.ts';
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

/** Loaded on demand so web builds never include the native bridge. */
const nativePlugin = () => import('./native.ts').then((m) => m.GridAlerts);

export const deviceAlerts: AlertService = {
  kind: 'device',
  support: () => 'supported',
  async enable(settings) {
    const plugin = await nativePlugin();
    const { notifications } = await plugin.requestPermissions();
    if (notifications !== 'granted') throw new Error('Notifications are turned off for everybody Hz in Android settings.');
    await plugin.configure({ enabled: true, sensitivity: settings.sensitivity });
    return { id: 'device', token: '' };
  },
  async update(_registration, settings) {
    await (await nativePlugin()).configure({ enabled: true, sensitivity: settings.sensitivity });
    return true;
  },
  async disable() {
    await (await nativePlugin()).configure({ enabled: false, sensitivity: 'balanced' });
  },
  async test() {
    await (await nativePlugin()).testAlert();
    return 'sent';
  },
};

export const noAlerts: AlertService = {
  kind: 'none',
  support: () => 'unsupported',
  enable: () => Promise.reject(new Error('Alerts are not available in this preview')),
  update: () => Promise.resolve(false),
  disable: () => Promise.resolve(),
  test: () => Promise.resolve('unavailable'),
};
