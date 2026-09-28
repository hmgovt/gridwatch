import type { RotationSchedule, RotationWindow } from './types.ts';

/**
 * Rota disconnection block letters used by the Electricity Supply Emergency
 * Code (ESEC). Each customer is allocated a letter, printed on their
 * electricity bill.
 *
 * VERIFY: the set below (A–U without I, O and Q, 18 blocks) is from ESEC
 * guidance as we understand it. Confirm against the ESEC guidance revised in
 * April 2026 before launch.
 */
export const ROTA_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'R', 'S', 'T', 'U'] as const;

export type RotaLetter = (typeof ROTA_LETTERS)[number];

export function isRotaLetter(value: unknown): value is RotaLetter {
  return typeof value === 'string' && (ROTA_LETTERS as readonly string[]).includes(value);
}

export function windowsForLetter(schedule: RotationSchedule, letter: RotaLetter): RotationWindow[] {
  return schedule.windows
    .filter((w) => w.blocks.includes(letter))
    .toSorted((a, b) => a.start.localeCompare(b.start));
}

/** The window the block is in now, or the next one coming up. */
export function currentOrNextWindow(
  schedule: RotationSchedule,
  letter: RotaLetter,
  now: Date,
): { window: RotationWindow; current: boolean } | null {
  for (const window of windowsForLetter(schedule, letter)) {
    const start = new Date(window.start).getTime();
    const end = new Date(window.end).getTime();
    if (now.getTime() >= start && now.getTime() < end) return { window, current: true };
    if (start > now.getTime()) return { window, current: false };
  }
  return null;
}

/** True while any window is current or still to come. */
export function rotationInForce(schedule: RotationSchedule | null, now: Date): schedule is RotationSchedule {
  return !!schedule && schedule.windows.some((w) => new Date(w.end).getTime() > now.getTime());
}
