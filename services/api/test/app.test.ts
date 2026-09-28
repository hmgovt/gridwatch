import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Alert, StatusSnapshot } from '@gridwatch/core';
import { createApp } from '../src/app.ts';
import { Store } from '../src/db.ts';
import { Ingestor } from '../src/ingest.ts';
import type { PushSender, PushTarget } from '../src/push.ts';
import { elexonClient } from '../src/sources/elexon.ts';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

function fakeFetch(): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
    const body = url.pathname.endsWith('/datasets/SYSWARN')
      ? publishedBefore(fixture('syswarn-2026-09-28.json'), url.searchParams.get('publishDateTimeTo'))
      : url.pathname.endsWith('/loss-of-load')
        ? fixture('lolpdrm.json')
        : JSON.stringify({ data: [{ measurementTime: url.searchParams.get('to'), frequency: 49.97 }] });
    return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

/** Behave like the real API: only return records published within the requested range. */
function publishedBefore(body: string, to: string | null): string {
  const parsed = JSON.parse(body) as { data: Array<{ publishTime: string }> };
  if (!to) return body;
  return JSON.stringify({ data: parsed.data.filter((r) => r.publishTime <= to) });
}

class RecordingSender implements PushSender {
  readonly enabled = true;
  sent: Array<{ endpoint: string; alert: Alert }> = [];
  async send(target: PushTarget, alert: Alert) {
    if (target.endpoint.includes('gone')) return 'gone' as const;
    this.sent.push({ endpoint: target.endpoint, alert });
    return 'sent' as const;
  }
}

const ADMIN = 'a'.repeat(40);
const ORIGIN = 'http://localhost:5173';
const keys = { p256dh: `B${'A'.repeat(86)}`, auth: 'A'.repeat(22) };
const endpoint = (name: string) => `https://fcm.googleapis.com/fcm/send/${name}`;

function postJson(body: unknown, headers: Record<string, string> = {}) {
  return { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) };
}

function setup(at = '2026-09-28T12:20:00Z') {
  let now = new Date(at);
  const store = new Store(':memory:');
  const sender = new RecordingSender();
  const ingestor = new Ingestor(store, elexonClient('https://data.example/bmrs/api/v1', fakeFetch()), sender, () => now);
  const app = createApp({
    store,
    ingestor,
    sender,
    allowedOrigins: [ORIGIN],
    vapidPublicKey: 'test-public-key',
    adminToken: ADMIN,
    clientKey: () => 'client',
    clock: () => now,
  });
  const subscribe = async (name: string, extra: Record<string, unknown> = {}) => {
    const res = await app.request('/v1/push/subscriptions', postJson({ channel: 'webpush', subscription: { endpoint: endpoint(name), keys }, ...extra }));
    return { res, body: (await res.json()) as { id: string; token: string } };
  };
  return { store, sender, ingestor, app, json: postJson, subscribe, setNow: (iso: string) => (now = new Date(iso)) };
}

describe('security headers and CORS', () => {
  it('sends a locked-down set of headers', async () => {
    const { app } = setup();
    const res = await app.request('/health');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('strict-transport-security')).toContain('max-age=63072000');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
  });

  it('only allows listed origins', async () => {
    const { app } = setup();
    const ok = await app.request('/v1/status', { headers: { origin: ORIGIN } });
    expect(ok.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    const bad = await app.request('/v1/status', { headers: { origin: 'https://evil.example' } });
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('status', () => {
  it('builds notices, headroom and source health from the feeds', async () => {
    const { app, ingestor } = setup('2026-09-28T15:10:00Z');
    await ingestor.ingestWarnings();
    await ingestor.ingestLossOfLoad();
    await ingestor.ingestFrequency();
    const res = await app.request('/v1/status');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('max-age=30');
    const body = (await res.json()) as StatusSnapshot;
    expect(body.mode).toBe('live');
    expect(body.notices).toHaveLength(1);
    expect(body.notices[0]?.history.map((e) => e.type)).toEqual(['issued', 'updated', 'cancelled']);
    expect(body.headroom.map((p) => p.deratedMarginMW)).toEqual([1521, 1050]);
    expect(body.frequency?.hz).toBe(49.97);
    expect(body.sources.find((s) => s.id === 'syswarn')).toMatchObject({ ok: true, critical: true });
  });

  it('records a failing feed instead of crashing', async () => {
    const store = new Store(':memory:');
    const failing = (async () => new Response('<html>down</html>', { status: 200, headers: { 'content-type': 'text/html' } })) as unknown as typeof fetch;
    const ingestor = new Ingestor(store, elexonClient('https://data.example/api', failing), new RecordingSender());
    await ingestor.ingestWarnings();
    expect(store.sourceHealth()[0]).toMatchObject({ id: 'syswarn', ok: false });
  });

  it('refuses plain HTTP feeds', async () => {
    const store = new Store(':memory:');
    const ingestor = new Ingestor(store, elexonClient('http://data.example/api', fakeFetch()), new RecordingSender());
    await ingestor.ingestWarnings();
    expect(store.sourceHealth()[0]?.lastError).toContain('non-HTTPS');
  });
});

describe('push subscriptions', () => {
  it('creates a subscription and returns a one-time token', async () => {
    const { subscribe, store } = setup();
    const { res, body } = await subscribe('device-1', { rotaLetter: 'C', sensitivity: 'essential' });
    expect(res.status).toBe(201);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const row = store.subscription(body.id)!;
    expect(row.tokenHash).not.toBe(body.token);
    expect(row).toMatchObject({ rotaLetter: 'C', sensitivity: 'essential' });
  });

  it.each([
    ['plain http', 'http://fcm.googleapis.com/fcm/send/x'],
    ['cloud metadata address', 'https://169.254.169.254/latest/meta-data'],
    ['localhost', 'https://localhost/push'],
    ['unknown host', 'https://push.evil.example/x'],
    ['custom port', 'https://fcm.googleapis.com:8443/fcm/send/x'],
    ['look-alike host', 'https://fcm.googleapis.com.evil.example/x'],
  ])('rejects a push endpoint on %s (SSRF)', async (_label, url) => {
    const { app, json } = setup();
    const res = await app.request('/v1/push/subscriptions', json({ channel: 'webpush', subscription: { endpoint: url, keys } }));
    expect(res.status).toBe(400);
  });

  it('rejects unknown fields, bad keys, non-JSON and oversized bodies', async () => {
    const { app, json } = setup();
    const base = { channel: 'webpush', subscription: { endpoint: endpoint('x'), keys } };
    expect((await app.request('/v1/push/subscriptions', json({ ...base, email: 'me@example.com' }))).status).toBe(400);
    expect((await app.request('/v1/push/subscriptions', json({ ...base, subscription: { endpoint: endpoint('x'), keys: { p256dh: 'short', auth: 'x' } } }))).status).toBe(400);
    expect((await app.request('/v1/push/subscriptions', json({ ...base, rotaLetter: 'I' }))).status).toBe(400);
    expect((await app.request('/v1/push/subscriptions', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'hi' })).status).toBe(415);
    expect((await app.request('/v1/push/subscriptions', json({ ...base, padding: 'x'.repeat(20_000) }))).status).toBe(413);
  });

  it('needs the token to change or delete a subscription', async () => {
    const { app, subscribe } = setup();
    const { body } = await subscribe('device-2');
    const put = (token: string) =>
      app.request(`/v1/push/subscriptions/${body.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ rotaLetter: 'K', sensitivity: 'balanced' }),
      });
    expect((await put('x'.repeat(43))).status).toBe(401);
    expect((await put(body.token)).status).toBe(204);
    const del = await app.request(`/v1/push/subscriptions/${body.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${body.token}` } });
    expect(del.status).toBe(204);
    expect((await put(body.token)).status).toBe(401);
  });
});

describe('alert fan-out', () => {
  it('pushes margin notices only to people who asked for everything, once each', async () => {
    const t = setup('2026-09-28T00:05:00Z');
    await t.subscribe('everything', { sensitivity: 'everything' });
    await t.subscribe('balanced', { sensitivity: 'balanced' });
    await t.ingestor.ingestWarnings();
    await t.ingestor.ingestWarnings();
    expect(t.sender.sent.map((s) => s.endpoint)).toEqual([endpoint('everything')]);
    expect(t.sender.sent[0]?.alert.body).toContain('Not a warning of power cuts');
  });

  it('does not replay old events when the service first starts', async () => {
    const t = setup('2026-09-28T18:00:00Z');
    await t.subscribe('everything', { sensitivity: 'everything' });
    await t.ingestor.ingestWarnings();
    expect(t.sender.sent).toHaveLength(0);
  });

  it('removes subscriptions the push service says are gone', async () => {
    const t = setup('2026-09-28T00:05:00Z');
    const { body } = await t.subscribe('gone-device', { sensitivity: 'everything' });
    await t.ingestor.ingestWarnings();
    expect(t.store.subscription(body.id)).toBeNull();
  });
});

describe('operator rotation route', () => {
  const schedule = {
    announcedAt: '2026-12-01T08:40:00Z',
    sourceName: 'NESO announcement',
    sourceUrl: 'https://www.neso.energy/',
    windows: [
      { blocks: ['A', 'B', 'C'], start: '2026-12-01T16:30:00Z', end: '2026-12-01T19:30:00Z' },
      { blocks: ['D', 'E', 'F'], start: '2026-12-01T17:30:00Z', end: '2026-12-01T20:30:00Z' },
    ],
  };

  it('rejects missing or wrong tokens', async () => {
    const { app } = setup();
    const req = (token?: string) =>
      app.request('/v1/admin/rotation', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(schedule),
      });
    expect((await req()).status).toBe(401);
    expect((await req('b'.repeat(40))).status).toBe(401);
  });

  it('publishes a schedule and alerts the affected block first', async () => {
    const t = setup('2026-12-01T08:45:00Z');
    await t.subscribe('block-c', { rotaLetter: 'C', sensitivity: 'essential' });
    await t.subscribe('block-k', { rotaLetter: 'K', sensitivity: 'essential' });
    await t.subscribe('no-letter', { sensitivity: 'balanced' });
    const res = await t.app.request('/v1/admin/rotation', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${ADMIN}` },
      body: JSON.stringify(schedule),
    });
    expect(res.status).toBe(204);
    const byEndpoint = Object.fromEntries(t.sender.sent.map((s) => [s.endpoint, s.alert]));
    expect(byEndpoint[endpoint('block-c')]?.title).toBe('Block C: power off 16:30–19:30 today');
    expect(byEndpoint[endpoint('block-k')]).toBeUndefined();
    expect(byEndpoint[endpoint('no-letter')]?.url).toBe('/settings');
    const status = (await (await t.app.request('/v1/status')).json()) as StatusSnapshot;
    expect(status.rotation?.windows).toHaveLength(2);
  });

  it('is switched off entirely without an admin token', async () => {
    const store = new Store(':memory:');
    const sender = new RecordingSender();
    const ingestor = new Ingestor(store, elexonClient('https://x.example', fakeFetch()), sender);
    const app = createApp({ store, ingestor, sender, allowedOrigins: [], vapidPublicKey: '', adminToken: '', clientKey: () => 'k' });
    const res = await app.request('/v1/admin/rotation', { method: 'DELETE', headers: { authorization: `Bearer ${'a'.repeat(40)}` } });
    expect(res.status).toBe(404);
  });
});

describe('rate limiting', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => {
    t = setup();
  });

  it('limits bursts from one client', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 125; i++) statuses.push((await t.app.request('/v1/notices')).status);
    expect(statuses.slice(0, 120).every((s) => s === 200)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
});
