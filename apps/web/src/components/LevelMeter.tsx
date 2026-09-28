import { motion } from 'motion/react';
import { NATIONAL_LEVELS, type NationalLevel } from '@gridwatch/core';

const STEPS: NationalLevel[] = [0, 1, 2, 3, 4];

/** The national escalation ladder as a five-step meter. */
export function LevelMeter({ level }: { level: NationalLevel }) {
  return (
    <div className={`meter nat-${level}`}>
      <meter className="visually-hidden" min={0} max={4} value={level} aria-label="National warning level">
        {NATIONAL_LEVELS[level].name}
      </meter>
      <div className="meter-track" aria-hidden="true">
        {STEPS.map((step) => (
          <span key={step} className="meter-step">
            {step <= level && (
              <motion.span
                className="meter-fill"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.45, delay: 0.15 + step * 0.08, ease: [0.2, 0.8, 0.2, 1] }}
              />
            )}
          </span>
        ))}
      </div>
      <div className="meter-labels" aria-hidden="true">
        <span>Normal</span>
        <span>Rotating cuts</span>
      </div>
    </div>
  );
}
