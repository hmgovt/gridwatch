import { NATIONAL_LEVELS, NOTICE_KINDS, type NationalLevel, type NoticeKind } from '@gridwatch/core';

interface Rung {
  level: NationalLevel;
  kinds: NoticeKind[];
  trigger: string;
}

const RUNGS: Rung[] = [
  { level: 1, kinds: ['EMN', 'CMN'], trigger: 'Spare capacity forecast to be low' },
  { level: 2, kinds: ['HRDR'], trigger: 'Margin still not recovered' },
  { level: 3, kinds: ['DCI'], trigger: 'Demand must fall shortly' },
  { level: 4, kinds: ['DCRP'], trigger: 'Shortfall expected to last' },
];

/**
 * How GB grid warnings escalate, and the path most of them take: back to
 * normal once generators respond.
 */
export function LadderDiagram({ current }: { current: NationalLevel }) {
  return (
    <figure className="ladder">
      <ol className="ladder-list">
        <li className={`ladder-rung nat-0 ${current === 0 ? 'is-current' : ''}`}>
          <span className="ladder-node" aria-hidden="true">
            0
          </span>
          <div className="ladder-text">
            <strong>{NATIONAL_LEVELS[0].name}</strong>
            <span className="muted">Enough spare capacity. Most days, all day.</span>
          </div>
          {current === 0 && <CurrentTag />}
        </li>
        {RUNGS.map((rung) => {
          const info = NOTICE_KINDS[rung.kinds[0]!];
          return (
            <li key={rung.level} className={`ladder-rung nat-${rung.level} ${current === rung.level ? 'is-current' : ''} ${current > rung.level ? 'is-passed' : ''}`}>
              <span className="ladder-trigger">
                <span aria-hidden="true">↓</span> {rung.trigger}
              </span>
              <span className="ladder-node" aria-hidden="true">
                {rung.level}
              </span>
              <div className="ladder-text">
                <strong>{info.name}</strong>
                <span className="ladder-official">{rung.kinds.map((k) => NOTICE_KINDS[k].officialName).join(' · ')}</span>
                <span className="muted">{info.leadTime} {info.whatToDo}</span>
                {rung.level === 1 && (
                  <span className="ladder-return">
                    <svg viewBox="0 0 24 24" className="icon" aria-hidden="true">
                      <path d="M9 7H15.5a4.5 4.5 0 0 1 0 9H6" />
                      <path d="M12 3.5 8.5 7 12 10.5" />
                    </svg>
                    Usual outcome: generators respond, notice cancelled, back to normal
                  </span>
                )}
              </div>
              {current === rung.level && <CurrentTag />}
            </li>
          );
        })}
      </ol>
      <figcaption>
        <strong>Most notices never get past step 1.</strong> Generators respond, the margin recovers and the notice is cancelled, as happened on 28 September 2026.
      </figcaption>
    </figure>
  );
}

function CurrentTag() {
  return <span className="chip chip-nat ladder-now">Now</span>;
}
