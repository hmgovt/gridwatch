import { motion } from 'motion/react';
import { useId, type ReactNode } from 'react';
import { platform } from '../platform/index.ts';

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  description?: string;
}

/** A radio group drawn as a segmented control, with a sliding selection. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  stacked = false,
}: {
  label: string;
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  stacked?: boolean;
}) {
  const name = useId();
  return (
    <fieldset className={`segmented ${stacked ? 'segmented-stacked' : ''}`}>
      <legend className="visually-hidden">{label}</legend>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <label key={option.value} className={`segment ${selected ? 'is-selected' : ''}`}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={selected}
              className="choice-input"
              onChange={() => {
                platform.tap();
                onChange(option.value);
              }}
            />
            {selected && <motion.span layoutId={`${name}-pill`} className="segment-pill" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            <span className="segment-label">{option.label}</span>
            {option.description && <span className="segment-desc">{option.description}</span>}
          </label>
        );
      })}
    </fieldset>
  );
}
