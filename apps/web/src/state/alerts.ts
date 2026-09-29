import { useEffect, useRef, useState } from 'react';
import { platform } from '../platform/index.ts';
import { usePrefs } from './prefs.tsx';

/** Turn alerts on and off, and keep the alert service's copy of preferences in step. */
export function useAlerts() {
  const { prefs, alerts, setAlerts } = usePrefs();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const service = platform.alerts;

  // Used from click handlers only, so plain functions are enough.
  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      setAlerts(await service.enable({ rotaLetter: prefs.rotaLetter, sensitivity: prefs.sensitivity }));
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
      await service.disable(alerts);
      setAlerts(null);
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    if (!alerts) return null;
    try {
      return await service.test(alerts);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The test alert failed.');
      return null;
    }
  };

  return { enabled: !!alerts, busy, error, enable, disable, test, support: service.support(), kind: service.kind };
}

/** Pass preference changes to the alert service shortly after they happen. */
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
      void platform.alerts.update(alerts, { rotaLetter: prefs.rotaLetter, sensitivity: prefs.sensitivity }).then((ok) => {
        if (!ok) setAlerts(null);
      });
    }, 600);
    return () => window.clearTimeout(t);
  }, [prefs.rotaLetter, prefs.sensitivity, alerts, setAlerts]);
}
