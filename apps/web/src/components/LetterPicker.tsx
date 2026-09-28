import { motion } from 'motion/react';
import { useId } from 'react';
import { ROTA_LETTERS, type RotaLetter } from '@gridwatch/core';
import { platform } from '../platform/index.ts';

/** Pick a rota letter. Native radio buttons give keyboard and screen reader support for free. */
export function LetterPicker({ value, onChange }: { value: RotaLetter | null; onChange: (letter: RotaLetter | null) => void }) {
  const name = useId();
  return (
    <fieldset className="letters-wrap">
      <legend className="visually-hidden">Rota letter</legend>
      <div className="letters">
        {ROTA_LETTERS.map((letter) => {
          const selected = letter === value;
          return (
            <label key={letter} className={`letter ${selected ? 'is-selected' : ''}`}>
              <input
                type="radio"
                name={name}
                value={letter}
                checked={selected}
                className="choice-input"
                onChange={() => {
                  platform.tap();
                  onChange(letter);
                }}
              />
              {selected && <motion.span layoutId={`${name}-pill`} className="letter-pill" transition={{ type: 'spring', stiffness: 520, damping: 34 }} />}
              <span className="letter-glyph">{letter}</span>
            </label>
          );
        })}
      </div>
      <label className={`btn btn-quiet letters-unsure ${value === null ? 'is-selected' : ''}`}>
        <input type="radio" name={name} value="" checked={value === null} className="choice-input" onChange={() => onChange(null)} />
        I don’t know it yet
      </label>
    </fieldset>
  );
}
