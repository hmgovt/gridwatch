/**
 * Postcode handling. The app only ever keeps the outward code (the part before
 * the space, e.g. `SW1A`), which covers thousands of homes and cannot identify
 * a household. Full postcodes typed by users are reduced on the device.
 */

const FULL = /^([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})$/;
const OUTWARD = /^[A-Z]{1,2}\d[A-Z\d]?$/;

export type Coverage = 'gb' | 'northern-ireland' | 'crown-dependency';

/** `sw1a 1aa` -> `SW1A`; `m1` -> `M1`; invalid input -> null. */
export function toOutwardCode(input: string): string | null {
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  const full = FULL.exec(cleaned.replace(/\s/g, ''));
  if (full?.[1]) return full[1];
  const outward = cleaned.split(' ')[0] ?? '';
  return OUTWARD.test(outward) ? outward : null;
}

export function isOutwardCode(value: unknown): value is string {
  return typeof value === 'string' && OUTWARD.test(value);
}

/** Postcode area: the leading letters (`SW1A` -> `SW`). */
export function postcodeArea(outward: string): string {
  return /^[A-Z]{1,2}/.exec(outward)?.[0] ?? '';
}

/**
 * Great Britain has one electricity system. Northern Ireland (BT) is run
 * separately by SONI, and the Channel Islands and Isle of Man have their own
 * utilities.
 */
export function coverageOf(outward: string): Coverage {
  const area = postcodeArea(outward);
  if (area === 'BT') return 'northern-ireland';
  if (area === 'GY' || area === 'JE' || area === 'IM') return 'crown-dependency';
  return 'gb';
}
