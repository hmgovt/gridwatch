import { activeNotices, NATIONAL_LEVELS, sortNotices, type NationalLevel } from '@gridwatch/core';
import { Callout105, ScenarioBanner, SourcesNote } from '../components/Bits.tsx';
import { FrequencyGauge } from '../components/FrequencyGauge.tsx';
import { HeadroomChart } from '../components/HeadroomChart.tsx';
import { Icon } from '../components/Icon.tsx';
import { LevelMeter } from '../components/LevelMeter.tsx';
import { NoticeRow } from '../components/NoticeRow.tsx';
import { RingLegend, StatusRing } from '../components/StatusRing.tsx';
import { StatusSummary } from '../components/StatusSummary.tsx';
import { useData } from '../data/DataProvider.tsx';
import { Link } from '../router.tsx';
import { usePrefs } from '../state/prefs.tsx';
import { useUi } from '../state/ui.tsx';

const NATIONAL_TEXT: Record<NationalLevel, string> = {
  0: 'No grid notices in force. NESO has the spare capacity it needs.',
  1: 'NESO has asked for more generation. A routine precaution that almost never leads to power cuts.',
  2: 'NESO has warned it may need to reduce demand. Most warnings like this are stood down.',
  3: 'NESO expects to reduce demand shortly. Some areas may be switched off briefly.',
  4: 'Areas are taking turns to be switched off to protect the system.',
};

export function NowScreen() {
  const { snapshot, status, now, mode } = useData();
  const { prefs } = usePrefs();

  if (!snapshot || !status) return <LiveUnavailable />;

  const national = status.national;
  const notices = sortNotices(snapshot.notices, now).slice(0, 4);
  const activeCount = activeNotices(snapshot.notices, now).length;

  return (
    <div className="now">
      <div className="now-hero">
        <ScenarioBanner />
        <StatusRing snapshot={snapshot} status={status} now={now} letter={prefs.rotaLetter} />
        <RingLegend snapshot={snapshot} status={status} now={now} letter={prefs.rotaLetter} />
        <StatusSummary status={status} />
      </div>

      <div className="now-context">
        <section className={`card grid-card nat-${national}`} aria-labelledby="grid-title">
          <div className="card-head">
            <h2 id="grid-title">The national grid</h2>
            <span className="chip chip-nat">
              <span className="dot" aria-hidden="true" />
              {NATIONAL_LEVELS[national].name}
            </span>
          </div>
          <LevelMeter level={national} />
          <p className="grid-text">{NATIONAL_TEXT[national]}</p>
          {notices.length > 0 ? (
            <ul className="notice-list">
              {notices.map((n) => (
                <li key={n.id}>
                  <NoticeRow notice={n} now={now} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted empty-line">No notices in the last 48 hours.</p>
          )}
          <Link to="/notices" className="card-link">
            {activeCount > 0 ? `${activeCount} in force · ` : ''}All notices
            <Icon name="chevron" />
          </Link>
        </section>

        <section className="card" aria-labelledby="headroom-title">
          <div className="card-head">
            <div>
              <h2 id="headroom-title">Spare capacity, next 12 hours</h2>
              <p className="card-sub">NESO’s forecast of power available above expected demand, after reserves.</p>
            </div>
            {mode === 'scenario' && <span className="chip">Illustrative</span>}
          </div>
          <HeadroomChart points={snapshot.headroom} now={now} />
        </section>

        {snapshot.frequency && (
          <section className="card" aria-labelledby="freq-title">
            <div className="card-head">
              <h2 id="freq-title">Grid frequency</h2>
              <span className="card-sub mono">live pulse</span>
            </div>
            <FrequencyGauge reading={snapshot.frequency} />
            <p className="card-note muted">
              The grid runs at 50 Hz. It dips when demand outruns supply, and NESO keeps it between 49.8 and 50.2 Hz. It shows the system
              is coping; it can’t predict a cut.
            </p>
          </section>
        )}

        <SourcesNote />
        <Callout105 />
      </div>
    </div>
  );
}

function LiveUnavailable() {
  const { error, loading, refresh } = useData();
  const { openScenarios } = useUi();
  return (
    <div className="unavailable card">
      <Icon name="unknown" className="icon unavailable-icon" />
      <h1>{loading ? 'Checking the grid…' : 'We can’t reach live data'}</h1>
      <p className="muted">
        {loading
          ? 'Fetching the latest notices and forecasts.'
          : (error ?? 'The Mainsight service didn’t respond.') + ' If your power is off, call 105 to report it or get an update.'}
      </p>
      <div className="unavailable-actions">
        <button type="button" className="btn btn-primary" onClick={refresh} disabled={loading}>
          <Icon name="refresh" />
          Try again
        </button>
        <button type="button" className="btn" onClick={openScenarios}>
          <Icon name="layers" />
          Preview a situation
        </button>
      </div>
    </div>
  );
}
