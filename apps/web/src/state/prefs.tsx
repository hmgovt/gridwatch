import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { isRotaLetter, SCENARIOS, type RotaLetter, type Sensitivity } from '@gridwatch/core';
import { IS_ARTIFACT, platform } from '../platform/index.ts';

export type ThemeChoice = 'system' | 'light' | 'dark';

export interface Prefs {
  rotaLetter: RotaLetter | null;
  sensitivity: Sensitivity;
  theme: ThemeChoice;
  onboarded: boolean;
  dataMode: 'live' | 'scenario';
  scenarioId: string;
}

export interface AlertRegistration {
  id: string;
  token: string;
}

const PREFS_KEY = 'prefs.v1';
const ALERTS_KEY = 'alerts.v1';

const DEFAULTS: Prefs = IS_ARTIFACT
  ? { rotaLetter: 'C', sensitivity: 'balanced', theme: 'system', onboarded: true, dataMode: 'scenario', scenarioId: 'emn-2026-09-28' }
  : { rotaLetter: null, sensitivity: 'balanced', theme: 'system', onboarded: false, dataMode: 'live', scenarioId: 'calm' };

function load(): Prefs {
  const stored = platform.storage.get<Partial<Prefs>>(PREFS_KEY, {});
  const prefs: Prefs = { ...DEFAULTS, ...stored };
  if (prefs.rotaLetter !== null && !isRotaLetter(prefs.rotaLetter)) prefs.rotaLetter = null;
  if (!SCENARIOS.some((s) => s.id === prefs.scenarioId)) prefs.scenarioId = DEFAULTS.scenarioId;
  if (IS_ARTIFACT) prefs.dataMode = 'scenario';
  // A scenario can be forced for demos with ?scenario=<id>.
  if (!IS_ARTIFACT) {
    const forced = new URLSearchParams(window.location.search).get('scenario');
    if (forced && SCENARIOS.some((s) => s.id === forced)) {
      prefs.dataMode = 'scenario';
      prefs.scenarioId = forced;
      prefs.onboarded = true;
    }
  }
  return prefs;
}

interface PrefsValue {
  prefs: Prefs;
  update(patch: Partial<Prefs>): void;
  alerts: AlertRegistration | null;
  setAlerts(registration: AlertRegistration | null): void;
  forgetEverything(): void;
}

const PrefsContext = createContext<PrefsValue | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(load);
  const [alerts, setAlertsState] = useState<AlertRegistration | null>(() =>
    platform.storage.get<AlertRegistration | null>(ALERTS_KEY, null),
  );

  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      platform.storage.set(PREFS_KEY, next);
      return next;
    });
  }, []);

  const setAlerts = useCallback((registration: AlertRegistration | null) => {
    setAlertsState(registration);
    if (registration) platform.storage.set(ALERTS_KEY, registration);
    else platform.storage.remove(ALERTS_KEY);
  }, []);

  const forgetEverything = useCallback(() => {
    platform.storage.clearAll();
    setAlertsState(null);
    setPrefs({ ...DEFAULTS, onboarded: IS_ARTIFACT });
  }, []);

  // Apply the theme choice. "System" leaves the page to prefers-color-scheme.
  useEffect(() => {
    const root = document.documentElement;
    if (prefs.theme === 'system') {
      if (!IS_ARTIFACT) root.removeAttribute('data-theme');
    } else root.setAttribute('data-theme', prefs.theme);
  }, [prefs.theme]);

  const value = useMemo(() => ({ prefs, update, alerts, setAlerts, forgetEverything }), [prefs, update, alerts, setAlerts, forgetEverything]);
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): PrefsValue {
  const value = useContext(PrefsContext);
  if (!value) throw new Error('usePrefs outside PrefsProvider');
  return value;
}
