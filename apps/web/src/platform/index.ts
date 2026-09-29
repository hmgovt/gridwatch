import { deviceAlerts, noAlerts, serverAlerts, type AlertService } from './alerts.ts';
import { storage, type KeyValueStore } from './storage.ts';

/** True for the self-contained scenario preview (no network, no service worker). */
export const IS_ARTIFACT = import.meta.env.MODE === 'artifact';

/** True inside the Android (Capacitor) app, built with `--mode native`. */
export const IS_NATIVE = import.meta.env.MODE === 'native';

/**
 * Where live data comes from: our API (`api`, the default for the website) or
 * Elexon directly from the device (`direct`, used by the native app).
 */
export const DATA_SOURCE: 'api' | 'direct' = IS_NATIVE || import.meta.env.VITE_DATA_SOURCE === 'direct' ? 'direct' : 'api';

export interface Platform {
  kind: 'web' | 'artifact' | 'native';
  storage: KeyValueStore;
  alerts: AlertService;
  /** Light haptic tick where supported. */
  tap(): void;
}

export const platform: Platform = {
  kind: IS_ARTIFACT ? 'artifact' : IS_NATIVE ? 'native' : 'web',
  storage,
  alerts: IS_ARTIFACT ? noAlerts : IS_NATIVE ? deviceAlerts : serverAlerts,
  tap() {
    try {
      navigator.vibrate?.(6);
    } catch {
      /* not supported */
    }
  },
};

export function registerServiceWorker(): void {
  // The native app bundles its assets, so it has no need of a service worker.
  if (IS_ARTIFACT || IS_NATIVE || !('serviceWorker' in navigator) || import.meta.env.DEV) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      /* offline support is optional */
    });
  });
}

/** In the native app, open the screen a tapped notification points to. */
export function onNotificationOpen(navigate: (path: string) => void): () => void {
  if (!IS_NATIVE) return () => undefined;
  let cancelled = false;
  let remove: (() => void) | undefined;
  import('./native.ts')
    .then(async ({ GridAlerts }) => {
      const handle = await GridAlerts.addListener('open', ({ path }) => {
        if (typeof path === 'string' && path.startsWith('/')) navigate(path);
      });
      if (cancelled) void handle.remove();
      else remove = () => void handle.remove();
    })
    .catch(() => {
      /* Not running inside the Android app (e.g. a browser test of the native build). */
    });
  return () => {
    cancelled = true;
    remove?.();
  };
}
