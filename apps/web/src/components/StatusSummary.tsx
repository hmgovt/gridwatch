import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import type { PersonalStatus } from '@gridwatch/core';
import { Link } from '../router.tsx';
import { Icon, LEVEL_ICON, type IconName } from './Icon.tsx';

/** Headline, plain-English explanation and a checklist of what to do. */
export function StatusSummary({ status }: { status: PersonalStatus }) {
  const [done, setDone] = useState<Record<string, boolean>>({});
  return (
    <section className={`summary lvl-${status.level}`} aria-live="polite">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={status.headline}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
          className="summary-inner"
        >
          <span className="chip chip-status">
            <Icon name={(LEVEL_ICON[status.level] ?? 'unknown') as IconName} />
            {status.freshness === 'stale' ? 'Checking for updates' : levelChip(status)}
          </span>
          <h1 className="summary-headline">{status.headline}</h1>
          <p className="summary-text">{status.summary}</p>

          {status.actions.length > 0 && (
            <ul className="actions" aria-label="What to do">
              {status.actions.map((action, i) => (
                <motion.li
                  key={action.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.12 + i * 0.07, duration: 0.3 }}
                >
                  <label className={`action ${done[action.id] ? 'is-done' : ''}`}>
                    <input
                      type="checkbox"
                      checked={!!done[action.id]}
                      onChange={(e) => setDone((d) => ({ ...d, [action.id]: e.target.checked }))}
                    />
                    <span className="action-box" aria-hidden="true">
                      <Icon name="check" />
                    </span>
                    <span>{action.text}</span>
                  </label>
                </motion.li>
              ))}
            </ul>
          )}

          {status.nudge && (
            <Link to="/settings" className="nudge">
              <span className="nudge-letter" aria-hidden="true">
                ?
              </span>
              <span>{status.nudge}</span>
              <Icon name="chevron" />
            </Link>
          )}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}

function levelChip(status: PersonalStatus): string {
  switch (status.level) {
    case 'clear':
      return 'No action needed';
    case 'headsup':
      return 'Worth knowing';
    case 'prepare':
      return 'Get ready';
    case 'off':
      return 'Planned power cut';
    default:
      return 'Status unconfirmed';
  }
}
