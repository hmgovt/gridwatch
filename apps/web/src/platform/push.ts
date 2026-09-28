/**
 * Push notifications. On the web this is the Push API through our service
 * worker; in the native shells it becomes APNs/FCM via Capacitor. Callers only
 * see this interface.
 */
export interface PushSubscriptionData {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
}

export type PushSupport = 'supported' | 'needs-install' | 'unsupported';

export interface PushPlatform {
  support(): PushSupport;
  permission(): NotificationPermission | 'unsupported';
  subscribe(vapidPublicKey: string): Promise<PushSubscriptionData>;
  unsubscribe(): Promise<void>;
}

function isIos(): boolean {
  return /iP(hone|ad|od)/.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

function urlBase64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export const webPush: PushPlatform = {
  support() {
    const capable = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    if (capable) return 'supported';
    // iOS only offers web push to apps added to the Home Screen.
    if (isIos() && !isStandalone()) return 'needs-install';
    return 'unsupported';
  },
  permission() {
    return 'Notification' in window ? Notification.permission : 'unsupported';
  },
  async subscribe(vapidPublicKey) {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Notifications were not allowed');
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBytes(vapidPublicKey),
      }));
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error('The browser returned an incomplete subscription');
    return { endpoint: json.endpoint, expirationTime: json.expirationTime ?? null, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } };
  },
  async unsubscribe() {
    if (!('serviceWorker' in navigator)) return;
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    await subscription?.unsubscribe();
  },
};

export const noPush: PushPlatform = {
  support: () => 'unsupported',
  permission: () => 'unsupported',
  subscribe: () => Promise.reject(new Error('Alerts are not available in this preview')),
  unsubscribe: () => Promise.resolve(),
};
