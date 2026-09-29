import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CANCELLATION, KIND_PATTERNS } from '@gridwatch/core';

/**
 * The Android background check classifies warnings in Java
 * (WarningClassifier.java). These tests fail if its patterns drift from the
 * ones the app and server use.
 */
const java = readFileSync(
  new URL('../android/app/src/main/java/uk/everybodyhz/app/WarningClassifier.java', import.meta.url),
  'utf8',
);

function javaConstant(name: string): string {
  const match = new RegExp(`static final String ${name} =\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(java);
  if (!match?.[1]) throw new Error(`${name} not found in WarningClassifier.java`);
  return match[1].replace(/\\\\/g, '\\');
}

describe('Android classifier parity', () => {
  it.each(KIND_PATTERNS.map(([kind, pattern]) => [kind, pattern] as const))('%s pattern matches core', (kind, pattern) => {
    expect(javaConstant(`${kind}_PATTERN`)).toBe(pattern.source);
  });

  it('cancellation pattern matches core', () => {
    expect(javaConstant('CANCELLATION_PATTERN')).toBe(CANCELLATION.source);
  });

  it('checks kinds in the same order', () => {
    const order = [...java.matchAll(/\{ Kind\.(\w+), Pattern\.compile/g)].map((m) => m[1]);
    expect(order).toEqual(KIND_PATTERNS.map(([kind]) => kind));
  });
});
