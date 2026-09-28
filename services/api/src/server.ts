import { serve } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import { join } from 'node:path';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { Store } from './db.ts';
import { Ingestor } from './ingest.ts';
import { log } from './log.ts';
import { webPushSender } from './push.ts';
import { elexonClient } from './sources/elexon.ts';

const config = loadConfig();
const store = new Store(join(config.DATA_DIR, 'gridwatch.sqlite'));
const sender = webPushSender({
  publicKey: config.VAPID_PUBLIC_KEY,
  privateKey: config.VAPID_PRIVATE_KEY,
  subject: config.VAPID_SUBJECT,
});
const ingestor = new Ingestor(store, elexonClient(config.ELEXON_BASE_URL), sender);

const app = createApp({
  store,
  ingestor,
  sender,
  allowedOrigins: config.ALLOWED_ORIGINS,
  vapidPublicKey: config.VAPID_PUBLIC_KEY,
  adminToken: config.ADMIN_TOKEN,
  clientKey: (c) => {
    if (config.TRUST_PROXY) {
      const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
      if (forwarded) return forwarded;
    }
    return getConnInfo(c).remote.address ?? 'unknown';
  },
});

if (config.INGEST) ingestor.start();
if (!sender.enabled) log.warn('push alerts disabled: VAPID keys not set');

const server = serve({ fetch: app.fetch, port: config.PORT, hostname: config.HOST }, (info) => {
  log.info('api listening', { host: info.address, port: info.port, ingest: config.INGEST });
});

function shutdown(signal: string) {
  log.info('shutting down', { signal });
  ingestor.stop();
  server.close(() => {
    store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
