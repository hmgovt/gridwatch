import { formatClock, formatDay, formatPower, formatWindow, NOTICE_KINDS, noticeState, sortNotices } from '@gridwatch/core';
import { ScenarioBanner } from '../components/Bits.tsx';
import { Icon } from '../components/Icon.tsx';
import { NoticeRow, NoticeTimeline } from '../components/NoticeRow.tsx';
import { useData } from '../data/DataProvider.tsx';
import { Link } from '../router.tsx';

export function NoticesScreen() {
  const { snapshot, now } = useData();
  const notices = snapshot ? sortNotices(snapshot.notices, now) : [];
  const active = notices.filter((n) => noticeState(n, now) === 'active');
  const past = notices.filter((n) => noticeState(n, now) !== 'active');

  return (
    <div className="page">
      <ScenarioBanner />
      <header className="page-head">
        <h1>Grid notices</h1>
        <p className="muted">
          Official warnings from NESO, the Great Britain system operator, in plain English. We check for new ones every two minutes.
        </p>
      </header>

      <section className="card" aria-labelledby="active-title">
        <div className="card-head">
          <h2 id="active-title">In force</h2>
          <span className="chip tabular">{active.length}</span>
        </div>
        {active.length ? (
          <ul className="notice-list">
            {active.map((n) => (
              <li key={n.id}>
                <NoticeRow notice={n} now={now} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted empty-line">Nothing in force right now.</p>
        )}
      </section>

      <section className="card" aria-labelledby="past-title">
        <div className="card-head">
          <h2 id="past-title">Recently resolved</h2>
          <span className="chip tabular">{past.length}</span>
        </div>
        {past.length ? (
          <ul className="notice-list">
            {past.map((n) => (
              <li key={n.id}>
                <NoticeRow notice={n} now={now} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted empty-line">No notices in the last 48 hours.</p>
        )}
      </section>
    </div>
  );
}

export function NoticeDetailScreen({ id }: { id: string }) {
  const { snapshot, now, mode } = useData();
  const notice = snapshot?.notices.find((n) => n.id === id);

  if (!notice) {
    return (
      <div className="page">
        <BackLink />
        <div className="card">
          <h1>Notice not found</h1>
          <p className="muted">It may be older than the notices we keep on screen. Recent notices are listed on the Notices page.</p>
        </div>
      </div>
    );
  }

  const info = NOTICE_KINDS[notice.kind];
  const state = noticeState(notice, now);
  const first = notice.history[0];
  const peakShortfall = Math.max(0, ...notice.history.map((e) => e.shortfallMW ?? 0));

  return (
    <article className={`page notice-detail nat-${info.level}`}>
      <BackLink />
      <ScenarioBanner />
      <header className="detail-head">
        <div className="detail-chips">
          <span className="chip chip-nat">
            <span className="dot" aria-hidden="true" />
            Step {info.level} of 4
          </span>
          <span className="chip">{state === 'active' ? 'In force' : state === 'cancelled' ? 'Cancelled' : 'Ended'}</span>
        </div>
        <h1>{info.name}</h1>
        <p className="detail-official">{info.officialName}</p>
      </header>

      <div className="detail-facts">
        <div className="fact">
          <span className="eyebrow">Covers</span>
          <strong className="tabular">{notice.window ? formatWindow(new Date(notice.window.start), new Date(notice.window.end), now) : 'Not stated'}</strong>
        </div>
        {notice.shortfallMW !== undefined && (
          <div className="fact">
            <span className="eyebrow">Latest shortfall</span>
            <strong>{formatPower(notice.shortfallMW)}</strong>
            {peakShortfall > notice.shortfallMW && <span className="muted">down from {formatPower(peakShortfall)}</span>}
          </div>
        )}
        {first && (
          <div className="fact">
            <span className="eyebrow">First issued</span>
            <strong className="tabular">
              {formatClock(new Date(first.at))} {formatDay(new Date(first.at), now).toLowerCase()}
            </strong>
          </div>
        )}
      </div>

      <section className="card detail-explain">
        <div>
          <h2>What it means</h2>
          <p>{info.meaning}</p>
        </div>
        <div>
          <h2>What you should do</h2>
          <p>{info.whatToDo}</p>
        </div>
        <div>
          <h2>What usually happens</h2>
          <p>{info.usualOutcome}</p>
        </div>
      </section>

      <section className="card" aria-labelledby="history-title">
        <div className="card-head">
          <h2 id="history-title">What’s happened so far</h2>
        </div>
        <NoticeTimeline notice={notice} />
        {mode === 'scenario' && snapshot?.scenario && !snapshot.scenario.hypothetical && (
          <p className="replay-note">
            <Icon name="sparkle" />
            What happened next: NESO cancelled this notice at 15:58, before the evening peak began.
          </p>
        )}
      </section>

      <p className="sources-note">
        <Icon name="shield" />
        <span>
          Source: {notice.source.url ? (
            <a href={notice.source.url} target="_blank" rel="noopener noreferrer">
              {notice.source.name}
            </a>
          ) : (
            notice.source.name
          )}
        </span>
      </p>
    </article>
  );
}

function BackLink() {
  return (
    <Link to="/notices" className="back-link">
      <Icon name="back" />
      Notices
    </Link>
  );
}
