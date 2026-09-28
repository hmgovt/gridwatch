/**
 * Small key-value store for settings kept on the device. The web version uses
 * localStorage, which can be unavailable (private browsing, blocked storage),
 * so every call is guarded and the app works without it.
 *
 * Native shells swap this for Capacitor Preferences (settings) and the
 * platform keychain/keystore (the alert token) without touching callers.
 */
export interface KeyValueStore {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
  remove(key: string): void;
  clearAll(): void;
}

const PREFIX = 'gw:';

function ls(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function webStore(): KeyValueStore {
  return {
    get<T>(key: string, fallback: T): T {
      try {
        const raw = ls()?.getItem(PREFIX + key);
        return raw == null ? fallback : (JSON.parse(raw) as T);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        ls()?.setItem(PREFIX + key, JSON.stringify(value));
      } catch {
        /* storage unavailable or full: keep working in memory */
      }
    },
    remove(key) {
      try {
        ls()?.removeItem(PREFIX + key);
      } catch {
        /* ignore */
      }
    },
    clearAll() {
      try {
        const store = ls();
        if (!store) return;
        for (const key of Object.keys(store)) if (key.startsWith(PREFIX)) store.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

export const storage: KeyValueStore = webStore();
