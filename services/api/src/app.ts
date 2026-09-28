import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ROTA_LETTERS, type RotationSchedule } from '@gridwatch/core';
import type { Store } from './db.ts';
import type { Ingestor } from './ingest.ts';
import { log, redactPath } from './log.ts';
import { isAllowedPushEndpoint, type PushSender } from './push.ts';
import { bearer, hashToken, newToken, RateLimiter, tokenMatches } from './security.ts';

export interface AppDeps {
  store: Store;
  ingestor: Ingestor;
  sender: PushSender;
  allowedOrigins: string[];
  vapidPublicKey: string;
  adminToken: string;
  clientKey: (c: Context) => string;
  clock?: () => Date;
}

const sensitivity = z.enum(['essential', 'balanced', 'everything']);
const rotaLetter = z.enum(ROTA_LETTERS).nullable();

const createSubscription = z.strictObject({
  channel: z.literal('webpush'),
  subscription: z.strictObject({
    endpoint: z.string().max(1024).refine(isAllowedPushEndpoint, 'Unsupported push service'),
    expirationTime: z.number().nullable().optional(),
    keys: z.strictObject({
      p256dh: z.string().regex(/^[A-Za-z0-9_-]{80,100}$/),
      auth: z.string().regex(/^[A-Za-z0-9_-]{16,32}$/),
    }),
  }),
  rotaLetter: rotaLetter.optional(),
  sensitivity: sensitivity.default('balanced'),
});

const updateSubscription = z.strictObject({
  rotaLetter: rotaLetter,
  sensitivity: sensitivity,
});

const isoDate = z.iso.datetime({ offset: true });
const rotationBody = z.strictObject({
  announcedAt: isoDate,
  sourceName: z.string().min(3).max(120),
  sourceUrl: z.url({ protocol: /^https$/ }).max(500).optional(),
  windows: z
    .array(
      z.strictObject({
        blocks: z.array(z.enum(ROTA_LETTERS)).min(1).max(ROTA_LETTERS.length),
        start: isoDate,
        end: isoDate,
      }),
    )
    .min(1)
    .max(200),
});

export function createApp(deps: AppDeps): Hono {
  const clock = deps.clock ?? (() => new Date());
  const app = new Hono();
  const general = new RateLimiter(120, 60_000);
  const writes = new RateLimiter(20, 60 * 60_000);
  const tests = new RateLimiter(3, 60 * 60_000);

  app.use('*', async (c, next) => {
    const started = Date.now();
    await next();
    log.info('request', { method: c.req.method, path: redactPath(c.req.path), status: c.res.status, ms: Date.now() - started });
  });

  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      strictTransportSecurity: 'max-age=63072000; includeSubDomains; preload',
      referrerPolicy: 'no-referrer',
      crossOriginResourcePolicy: 'same-site',
      xFrameOptions: 'DENY',
    }),
  );

  app.use(
    '/v1/*',
    cors({
      origin: (origin) => (deps.allowedOrigins.includes(origin) ? origin : null),
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
      credentials: false,
    }),
  );

  app.use('*', bodyLimit({ maxSize: 16 * 1024, onError: (c) => c.json({ error: 'Request body too large' }, 413) }));

  app.use('/v1/*', async (c, next) => {
    if (!general.allow(deps.clientKey(c))) return c.json({ error: 'Too many requests. Try again in a minute.' }, 429);
    await next();
  });

  app.get('/health', (c) => c.json({ ok: true }));

  app.get('/v1/status', (c) => {
    c.header('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    return c.json(deps.ingestor.snapshot(clock()));
  });

  app.get('/v1/notices', (c) => {
    c.header('Cache-Control', 'public, max-age=60');
    return c.json({ notices: deps.ingestor.notices(clock(), 30) });
  });

  app.get('/v1/push/public-key', (c) => {
    if (!deps.sender.enabled || !deps.vapidPublicKey) return c.json({ error: 'Push alerts are not configured' }, 404);
    c.header('Cache-Control', 'public, max-age=3600');
    return c.json({ publicKey: deps.vapidPublicKey });
  });

  app.post('/v1/push/subscriptions', async (c) => {
    if (!writes.allow(deps.clientKey(c))) return c.json({ error: 'Too many requests' }, 429);
    const body = createSubscription.safeParse(await readJson(c));
    if (!body.success) return c.json({ error: 'Invalid subscription', issues: summarise(body.error) }, 400);
    const now = clock().toISOString();
    const id = randomUUID();
    const token = newToken();
    deps.store.upsertSubscription({
      id,
      tokenHash: hashToken(token),
      channel: 'webpush',
      endpoint: body.data.subscription.endpoint,
      p256dh: body.data.subscription.keys.p256dh,
      auth: body.data.subscription.keys.auth,
      rotaLetter: body.data.rotaLetter ?? null,
      sensitivity: body.data.sensitivity,
      createdAt: now,
      lastSeenAt: now,
    });
    c.header('Cache-Control', 'no-store');
    return c.json({ id, token }, 201);
  });

  app.put('/v1/push/subscriptions/:id', async (c) => {
    const sub = authorise(c, deps.store);
    const body = updateSubscription.safeParse(await readJson(c));
    if (!body.success) return c.json({ error: 'Invalid preferences', issues: summarise(body.error) }, 400);
    deps.store.updateSubscriptionPrefs(sub.id, body.data.rotaLetter, body.data.sensitivity, clock());
    return c.body(null, 204);
  });

  app.delete('/v1/push/subscriptions/:id', (c) => {
    const sub = authorise(c, deps.store);
    deps.store.deleteSubscription(sub.id);
    return c.body(null, 204);
  });

  app.post('/v1/push/subscriptions/:id/test', async (c) => {
    const sub = authorise(c, deps.store);
    if (!tests.allow(sub.id)) return c.json({ error: 'You can send three test alerts an hour' }, 429);
    const result = await deps.sender.send(sub, {
      title: 'Test alert',
      body: 'Alerts are working. We’ll only notify you when it matters.',
      url: '/settings',
      tag: 'test',
      urgency: 'normal',
    });
    if (result === 'gone') deps.store.deleteSubscription(sub.id);
    return c.json({ result });
  });

  // Operator route for publishing a rota by hand. Disabled unless ADMIN_TOKEN is set.
  app.put('/v1/admin/rotation', async (c) => {
    requireAdmin(c, deps.adminToken);
    const body = rotationBody.safeParse(await readJson(c));
    if (!body.success) return c.json({ error: 'Invalid rotation schedule', issues: summarise(body.error) }, 400);
    for (const w of body.data.windows) {
      if (new Date(w.end).getTime() <= new Date(w.start).getTime()) return c.json({ error: 'Each window must end after it starts' }, 400);
    }
    const schedule: RotationSchedule = {
      announcedAt: new Date(body.data.announcedAt).toISOString(),
      source: { name: body.data.sourceName, ...(body.data.sourceUrl ? { url: body.data.sourceUrl } : {}) },
      windows: body.data.windows.map((w) => ({
        blocks: [...new Set(w.blocks)],
        start: new Date(w.start).toISOString(),
        end: new Date(w.end).toISOString(),
      })),
    };
    await deps.ingestor.setRotation(schedule);
    log.warn('rotation schedule published by operator', { windows: schedule.windows.length });
    return c.body(null, 204);
  });

  app.delete('/v1/admin/rotation', async (c) => {
    requireAdmin(c, deps.adminToken);
    await deps.ingestor.setRotation(null);
    log.warn('rotation schedule cleared by operator');
    return c.body(null, 204);
  });

  app.notFound((c) => c.json({ error: 'Not found' }, 404));

  app.onError((error, c) => {
    if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
    log.error('unhandled error', { path: redactPath(c.req.path), error: error.message });
    return c.json({ error: 'Something went wrong on our side' }, 500);
  });

  return app;
}

async function readJson(c: Context): Promise<unknown> {
  const type = c.req.header('content-type') ?? '';
  if (!type.startsWith('application/json')) throw new HTTPException(415, { message: 'Send JSON' });
  try {
    return await c.req.json();
  } catch {
    throw new HTTPException(400, { message: 'Malformed JSON' });
  }
}

function authorise(c: Context, store: Store) {
  const token = bearer(c.req.header('authorization'));
  const sub = store.subscription(c.req.param('id') ?? '');
  // Same response whether the id or the token is wrong, so ids can't be probed.
  if (!token || !sub || !tokenMatches(token, sub.tokenHash)) throw new HTTPException(401, { message: 'Not authorised' });
  return sub;
}

function requireAdmin(c: Context, adminToken: string): void {
  const token = bearer(c.req.header('authorization'));
  if (!adminToken) throw new HTTPException(404, { message: 'Not found' });
  if (!token || !tokenMatches(token, hashToken(adminToken))) throw new HTTPException(401, { message: 'Not authorised' });
}

function summarise(error: z.ZodError): string[] {
  return error.issues.slice(0, 5).map((i) => `${i.path.join('.') || 'body'}: ${i.message}`);
}
