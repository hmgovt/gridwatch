import { alertFor, isRotaLetter, type AlertEvent } from '@gridwatch/core';
import type { Store } from './db.ts';
import { log } from './log.ts';
import type { PushSender } from './push.ts';

export interface FanoutResult {
  considered: number;
  sent: number;
  removed: number;
  failed: number;
}

/**
 * Send one event to every subscriber who wants it. Each subscriber gets each
 * alert at most once, however many times the event is replayed.
 */
export async function fanOut(store: Store, sender: PushSender, event: AlertEvent, eventKey: string, now: Date): Promise<FanoutResult> {
  const result: FanoutResult = { considered: 0, sent: 0, removed: 0, failed: 0 };
  if (!sender.enabled) return result;

  const jobs: Array<() => Promise<void>> = [];
  for (const sub of store.allSubscriptions()) {
    result.considered++;
    const alert = alertFor(
      event,
      { sensitivity: sub.sensitivity, rotaLetter: isRotaLetter(sub.rotaLetter) ? sub.rotaLetter : null },
      now,
    );
    if (!alert) continue;
    if (!store.claimDelivery(sub.id, eventKey, now)) continue;
    jobs.push(async () => {
      const outcome = await sender.send(sub, alert);
      if (outcome === 'sent') result.sent++;
      else if (outcome === 'gone') {
        store.deleteSubscription(sub.id);
        result.removed++;
      } else result.failed++;
    });
  }
  await runWithConcurrency(jobs, 16);
  log.info('fan-out complete', { event: eventKey, ...result });
  return result;
}

async function runWithConcurrency(jobs: Array<() => Promise<void>>, limit: number): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, jobs.length) }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      if (job) await job();
    }
  });
  await Promise.all(workers);
}
