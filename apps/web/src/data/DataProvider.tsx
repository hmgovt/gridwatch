import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { assessPersonal, buildScenario, type PersonalStatus, type StatusSnapshot } from '@gridwatch/core';
import { platform } from '../platform/index.ts';
import { usePrefs } from '../state/prefs.tsx';
import { api, ApiError } from './api.ts';

interface DataValue {
  snapshot: StatusSnapshot | null;
  /** The moment the UI describes: real time for live data, the scenario's time for previews. */
  now: Date;
  status: PersonalStatus | null;
  mode: 'live' | 'scenario';
  loading: boolean;
  error: string | null;
  /** When the live snapshot shown was fetched (it may come from the offline cache). */
  fetchedAt: Date | null;
  refresh(): void;
}

const DataContext = createContext<DataValue | null>(null);
const CACHE_KEY = 'snapshot.cache.v1';
const POLL_MS = 60_000;

export function DataProvider({ children }: { children: ReactNode }) {
  const { prefs } = usePrefs();
  const live = useLiveSnapshot(prefs.dataMode === 'live');
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const scenario = useMemo(
    () => (prefs.dataMode === 'scenario' ? buildScenario(prefs.scenarioId) : null),
    [prefs.dataMode, prefs.scenarioId],
  );

  const value = useMemo<DataValue>(() => {
    const snapshot = scenario ?? live.snapshot;
    const now = scenario?.scenario ? new Date(scenario.scenario.at) : clock;
    const status = snapshot ? assessPersonal(snapshot, { rotaLetter: prefs.rotaLetter }, now) : null;
    return {
      snapshot,
      now,
      status,
      mode: scenario ? 'scenario' : 'live',
      loading: !scenario && live.loading,
      error: scenario ? null : live.error,
      fetchedAt: scenario ? now : live.fetchedAt,
      refresh: live.refresh,
    };
  }, [scenario, live, clock, prefs.rotaLetter]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataValue {
  const value = useContext(DataContext);
  if (!value) throw new Error('useData outside DataProvider');
  return value;
}

interface LiveState {
  snapshot: StatusSnapshot | null;
  fetchedAt: Date | null;
  error: string | null;
}

function readCache(): LiveState {
  const cached = platform.storage.get<{ at: string; snapshot: StatusSnapshot } | null>(CACHE_KEY, null);
  return { snapshot: cached?.snapshot ?? null, fetchedAt: cached ? new Date(cached.at) : null, error: null };
}

function useLiveSnapshot(enabled: boolean) {
  // Start from the offline cache so the last known status shows instantly.
  const [state, setState] = useState<LiveState>(readCache);
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const snapshot = await api.status();
      const fetchedAt = new Date();
      setState({ snapshot, fetchedAt, error: null });
      platform.storage.set(CACHE_KEY, { at: fetchedAt.toISOString(), snapshot });
    } catch (e) {
      const error = e instanceof ApiError ? e.message : 'Something went wrong fetching the latest status.';
      setState((s) => ({ ...s, error }));
    } finally {
      inFlight.current = false;
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const first = window.setTimeout(() => void load(), 0);
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [enabled, load]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  // Loading until the first answer (data or an error), or while a manual refresh runs.
  const loading = enabled && ((!state.snapshot && !state.error) || refreshing);
  return useMemo(() => ({ ...state, loading, refresh }), [state, loading, refresh]);
}
