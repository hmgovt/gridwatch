import { formatClock, formatDay, formatRelative } from '@gridwatch/core';
import { useData } from '../data/DataProvider.tsx';
import { useUi } from '../state/ui.tsx';
import { Icon } from './Icon.tsx';

/** Always visible when the app is showing a scenario instead of live data. */
export function ScenarioBanner() {
  const { snapshot, mode, now } = useData();
  const { openScenarios } = useUi();
  if (mode !== 'scenario' || !snapshot?.scenario) return null;
  const meta = snapshot.scenario;
  return (
    <div className="scenario-banner">
      <span className="chip scenario-chip">
        <Icon name="layers" />
        {meta.hypothetical ? 'Hypothetical scenario' : 'Replay of a real event'}
      </span>
      <span className="scenario-banner-text">
        <strong>{meta.title}</strong>
        <span className="muted">
          {' '}
          · shown at {formatClock(now)}
          {meta.hypothetical ? '' : `, ${formatDay(now, new Date()).toLowerCase()}`}
        </span>
      </span>
      <button type="button" className="btn btn-quiet scenario-change" onClick={openScenarios}>
        Change
      </button>
    </div>
  );
}

export function SourcesNote() {
  const { snapshot, mode, fetchedAt, now, refresh, loading } = useData();
  if (!snapshot) return null;
  if (mode === 'scenario') {
    return (
      <p className="sources-note">
        <Icon name="layers" />
        <span>
          Scenario data for previewing the app.{' '}
          {snapshot.scenario?.sourceNote ?? 'Figures are illustrative.'}
          {snapshot.notices[0]?.source.url && (
            <>
              {' '}
              <a href={snapshot.notices[0].source.url} target="_blank" rel="noopener noreferrer">
                View the source
              </a>
              .
            </>
          )}
        </span>
      </p>
    );
  }
  const failing = snapshot.sources.filter((s) => !s.ok);
  return (
    <p className="sources-note">
      <Icon name="shield" />
      <span>
        NESO warnings and forecasts via Elexon BMRS.{' '}
        {fetchedAt ? `Updated ${formatRelative(fetchedAt, now)}.` : ''}
        {failing.length > 0 ? ` ${failing.length} feed${failing.length > 1 ? 's are' : ' is'} delayed.` : ''}{' '}
        <button type="button" className="link-btn" onClick={refresh} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </span>
    </p>
  );
}

export function Callout105() {
  return (
    <aside className="callout-105">
      <span className="callout-num mono" aria-hidden="true">
        105
      </span>
      <div>
        <strong>Power cut right now?</strong>
        <p className="muted">
          Call <span className="mono">105</span> free from any phone in England, Scotland or Wales to report it or get an update from
          your network operator.
        </p>
      </div>
    </aside>
  );
}
