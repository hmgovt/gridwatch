import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../data/api.ts';
import { platform } from '../platform/index.ts';
import { usePrefs } from './prefs.tsx';

/** Turn push alerts on and off, and keep the server's copy of preferences in step. */
export function useAlerts() {
  const { prefs, alerts, setAlerts } = usePrefs();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Used from click handlers only, so plain functions are enough.
  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      const { publicKey } = await api.publicKey();
      const subscription = await platform.push.subscribe(publicKey);
      const registration = await api.subscribe(subscription, { rotaLetter: prefs.rotaLetter, sensitivity: prefs.sensitivity });
      setAlerts(registration);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Alerts could not be turned on.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setError(null);
    try {
      if (alerts) await api.unsubscribe(alerts.id, alerts.token).catch(() => undefined);
      await platform.push.unsubscribe();
      setAlerts(null);
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    if (!alerts) return null;
    try {
      const { result } = await api.testAlert(alerts.id, alerts.token);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The test alert failed.');
      return null;
    }
  };

  return { enabled: !!alerts, busy, error, enable, disable, test, support: platform.push.support() };
}

/** Push preference changes to the server shortly after they happen. */
export function useAlertPrefsSync() {
  const { prefs, alerts, setAlerts } = usePrefs();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!alerts) return;
    const t = window.setTimeout(() => {
      api.updatePrefs(alerts.id, alerts.token, { rotaLetter: prefs.rotaLetter, sensitivity: prefs.sensitivity }).catch((e) => {
        if (e instanceof ApiError && e.status === 401) setAlerts(null);
      });
    }, 600);
    return () => window.clearTimeout(t);
  }, [prefs.rotaLetter, prefs.sensitivity, alerts, setAlerts]);
}
