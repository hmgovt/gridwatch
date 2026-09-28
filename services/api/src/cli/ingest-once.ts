/**
 * Fetch every feed once, print what was understood, and exit. Use this to
 * check the Elexon adapters against the live API.
 */
import { join } from 'node:path';
import { assessPersonal, formatClock, NOTICE_KINDS, summariseHeadroom } from '@gridwatch/core';
import { loadConfig } from '../config.ts';
import { Store } from '../db.ts';
import { Ingestor } from '../ingest.ts';
import { webPushSender } from '../push.ts';
import { elexonClient } from '../sources/elexon.ts';

const config = loadConfig();
const store = new Store(join(config.DATA_DIR, 'gridwatch.sqlite'));
const ingestor = new Ingestor(store, elexonClient(config.ELEXON_BASE_URL), webPushSender({ publicKey: '', privateKey: '', subject: '' }));

await ingestor.ingestWarnings();
await ingestor.ingestLossOfLoad();
await ingestor.ingestFrequency();

const now = new Date();
const snapshot = ingestor.snapshot(now);
for (const s of snapshot.sources) console.log(`${s.ok ? 'ok  ' : 'FAIL'} ${s.label}`);
console.log(`\nNotices (${snapshot.notices.length}):`);
for (const n of snapshot.notices) {
  console.log(`  ${NOTICE_KINDS[n.kind].officialName}${n.cancelled ? ' (cancelled)' : ''} ${n.window ? `${formatClock(new Date(n.window.start))}-${formatClock(new Date(n.window.end))}` : ''}`);
}
const headroom = summariseHeadroom(snapshot.headroom, now);
console.log(`\nHeadroom points: ${snapshot.headroom.length}${headroom ? `, tightest ${headroom.tightest.deratedMarginMW} MW at ${formatClock(new Date(headroom.tightest.start))}` : ''}`);
console.log(`Frequency: ${snapshot.frequency ? `${snapshot.frequency.hz} Hz` : 'none'}`);
console.log(`\nHousehold status: ${assessPersonal(snapshot, {}, now).headline}`);
store.close();
