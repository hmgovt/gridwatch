import type { Alert } from '@gridwatch/core';
import { runCheck, STALE_AFTER, type Health } from './check.ts';
import { fcmSender, type PushSender } from './fcm.ts';
import { secretsEqual } from './http.ts';
import { postersFrom, type SocialEnv } from './social.ts';
import { D1Store, type StateStore } from './store.ts';

/**
 * everybody Hz production server (Cloudflare Worker).
 *
 * - Every minute: check NESO's warnings, push new notice events to phones via
 *   Firebase topics (stand-downs included), and post them to social media.
 * - GET /health: when the last good check ran (for uptime monitors).
 * - POST /admin/test-push: send a test alert to one device (admin token).
 *
 * Secrets are set with `wrangler secret put`, never committed. See docs/DEPLOY.md.
 */
export interface Env extends SocialEnv {
  DB: D1Database;
  ARCHIVE?: R2Bucket;
  SITE_URL: string;
  ELEXON_BASE?: string;
  /** The Firebase service account key, as JSON. Without it, no pushes are sent. */
  FCM_SERVICE_ACCOUNT?: string;
  ADMIN_TOKEN?: string;
  HEARTBEAT_URL?: string;
  /** "off" stops social posting without removing the secrets. */
  POSTING?: string;
}

function pushFrom(env: Env, store: StateStore): PushSender | null {
  return env.FCM_SERVICE_ACCOUNT ? fcmSender(env.FCM_SERVICE_ACCOUNT, store, fetch) : null;
}

export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const store = new D1Store(env.DB);
    const deps = {
      fetch,
      store,
      push: pushFrom(env, store),
      posters: env.POSTING === 'off' ? [] : postersFrom(env, fetch),
      siteUrl: env.SITE_URL,
      ...(env.ELEXON_BASE ? { elexonBase: env.ELEXON_BASE } : {}),
      ...(env.ARCHIVE ? { archive: env.ARCHIVE } : {}),
      ...(env.HEARTBEAT_URL ? { heartbeatUrl: env.HEARTBEAT_URL } : {}),
    };
    ctx.waitUntil(
      runCheck(deps, new Date(controller.scheduledTime)).then((report) => {
        // Logs carry keys and channel names only: no tokens, no message bodies.
        if (report.sent.length || report.failed.length) console.log(JSON.stringify({ sent: report.sent, failed: report.failed }));
      }),
    );
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const store = new D1Store(env.DB);

    if (req.method === 'GET' && url.pathname === '/health') {
      const health = await store.get<Health>('health');
      const fresh = !!health?.lastSuccessAt && Date.now() - new Date(health.lastSuccessAt).getTime() < STALE_AFTER;
      return json({ ok: fresh, ...health }, fresh ? 200 : 503);
    }

    if (req.method === 'POST' && url.pathname === '/admin/test-push') {
      const auth = req.headers.get('authorization') ?? '';
      if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 32 || !(await secretsEqual(auth, `Bearer ${env.ADMIN_TOKEN}`))) {
        return json({ error: 'Unauthorised' }, 401);
      }
      const push = pushFrom(env, store);
      if (!push) return json({ error: 'FCM_SERVICE_ACCOUNT is not set' }, 503);
      const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
      const token = typeof body?.token === 'string' && /^[\w:-]{20,4096}$/.test(body.token) ? body.token : null;
      if (!token) return json({ error: 'Send {"token": "<device push ID from the app>"}' }, 400);
      const alert: Alert = {
        title: 'Test alert from the server',
        body: 'Server push works. Real alerts arrive the same way, within about a minute of NESO publishing.',
        url: '/settings',
        tag: 'server-test',
        urgency: 'normal',
      };
      await push.toDevice(token, alert);
      return json({ ok: true });
    }

    return json({ error: 'Not found' }, 404);
  },
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  });
}
