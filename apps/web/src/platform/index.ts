import { noPush, webPush, type PushPlatform } from './push.ts';
import { storage, type KeyValueStore } from './storage.ts';

/** True for the self-contained scenario preview (no network, no service worker). */
export const IS_ARTIFACT = import.meta.env.MODE === 'artifact';

export interface Platform {
  kind: 'web' | 'artifact';
  storage: KeyValueStore;
  push: PushPlatform;
  /** Light haptic tick where supported. Native shells map this to Capacitor Haptics. */
  tap(): void;
}

export const platform: Platform = {
  kind: IS_ARTIFACT ? 'artifact' : 'web',
  storage,
  push: IS_ARTIFACT ? noPush : webPush,
  tap() {
    try {
      navigator.vibrate?.(6);
    } catch {
      /* not supported */
    }
  },
};

export function registerServiceWorker(): void {
  if (IS_ARTIFACT || !('serviceWorker' in navigator) || import.meta.env.DEV) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      /* offline support is optional */
    });
  });
}
