import {
  formatClock,
  formatRelative,
  formatWindow,
  lastEvent,
  NOTICE_KINDS,
  noticeState,
  type Notice,
  type NoticeKind,
} from '@gridwatch/core';
import { Link } from '../router.tsx';
import { Icon } from './Icon.tsx';

const STATE_LABEL = { active: 'In force', cancelled: 'Cancelled', ended: 'Ended' } as const;

/** What a cancellation means, by kind. Only claims what the cancellation itself tells us. */
const STOOD_DOWN: Record<NoticeKind, string> = {
  EMN: 'Margins recovered. No action was needed.',
  CMN: 'The forecast improved. No action was needed.',
  HRDR: 'Stood down. No demand reduction was needed.',
  DCI: 'Stood down.',
  DCRP: 'The rotation has been stood down.',
};

export function NoticeRow({ notice, now }: { notice: Notice; now: Date }) {
  const info = NOTICE_KINDS[notice.kind];
  const state = noticeState(notice, now);
  const last = lastEvent(notice);
  const when = notice.window ? formatWindow(new Date(notice.window.start), new Date(notice.window.end), now) : 'No time window given';
  return (
    <Link to={`/notices/${notice.id}`} className={`notice-row nat-${info.level} state-${state}`}>
      <span className="notice-mark" aria-hidden="true" />
      <span className="notice-body">
        <span className="notice-title">{info.name}</span>
        <span className="notice-when tabular">{when}</span>
        <span className="notice-meta">
          {info.officialName}
          {last ? ` · ${last.type === 'issued' ? 'issued' : last.type === 'cancelled' ? 'cancelled' : 'updated'} ${formatRelative(new Date(last.at), now)}` : ''}
        </span>
      </span>
      <span className={`chip notice-state ${state === 'active' ? 'chip-nat' : ''}`}>{STATE_LABEL[state]}</span>
      <Icon name="chevron" className="icon notice-chevron" />
    </Link>
  );
}

export function NoticeTimeline({ notice }: { notice: Notice }) {
  return (
    <ol className="timeline">
      {notice.history.map((event, i) => (
        <li key={`${event.type}-${event.at}`} className={`timeline-item timeline-${event.type}`} style={{ ['--i' as string]: i }}>
          <span className="timeline-node" aria-hidden="true" />
          <div className="timeline-content">
            <span className="timeline-time mono tabular">{formatClock(new Date(event.at))}</span>
            <strong className="timeline-title">
              {event.type === 'issued' ? 'Issued' : event.type === 'updated' ? 'Updated' : 'Cancelled'}
            </strong>
            {event.shortfallMW !== undefined && (
              <span className="timeline-detail">
                Stated shortfall <strong className="tabular">{event.shortfallMW.toLocaleString('en-GB')} MW</strong>
              </span>
            )}
            {event.type === 'cancelled' && <span className="timeline-detail">{STOOD_DOWN[notice.kind]}</span>}
            {event.sourceText && (
              <details className="timeline-source">
                <summary>Official wording</summary>
                <p className="mono">{event.sourceText}</p>
              </details>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
