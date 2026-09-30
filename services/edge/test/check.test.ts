import { beforeAll, describe, expect, it } from 'vitest';
import syswarn from '../../api/test/fixtures/syswarn-2026-09-28.json' with { type: 'json' };
import { noticeAt, runCheck, type CheckDeps, type Health } from '../src/check.ts';
import { fcmSender, parseServiceAccount, signJwt } from '../src/fcm.ts';
import { secretsEqual, type Fetch } from '../src/http.ts';
import { linkFacets, postersFrom } from '../src/social.ts';
import { MemoryStore } from '../src/store.ts';

/**
 * Replays NESO's real messages from 27-28 September 2026 through the whole
 * pipeline: Elexon → notices → Firebase topics and social posts.
 */
interface Call {
  host: string;
  path: string;
  body: Record<string, unknown> | string | undefined;
  headers: Record<string, string>;
}

let serviceAccountJson = '';
let publicKey: CryptoKey;

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  publicKey = pair.publicKey;
  const pkcs8 = new Uint8Array((await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer);
  const b64 = btoa(String.fromCharCode(...pkcs8));
  const pem = `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----\n`;
  serviceAccountJson = JSON.stringify({ project_id: 'everybodyhz-test', client_email: 'push@everybodyhz-test.iam.gserviceaccount.com', private_key: pem });
});

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const decode = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

function world(options: { fcmFailures?: number; elexonDown?: boolean } = {}) {
  const calls: Call[] = [];
  let fcmFailures = options.fcmFailures ?? 0;

  const fetchFn: Fetch = async (input, init) => {
    const url = new URL(input);
    const raw = typeof init?.body === 'string' ? init.body : undefined;
    let body: Call['body'] = raw;
    try {
      if (raw) body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      /* form-encoded */
    }
    calls.push({ host: url.host, path: url.pathname, body, headers: Object.fromEntries(new Headers(init?.headers).entries()) });

    switch (url.host) {
      case 'data.elexon.co.uk': {
        if (options.elexonDown) return new Response('down', { status: 503 });
        const from = url.searchParams.get('publishDateTimeFrom')!;
        const to = url.searchParams.get('publishDateTimeTo')!;
        return reply({ data: syswarn.data.filter((r) => r.publishTime >= from && r.publishTime <= to) });
      }
      case 'oauth2.googleapis.com':
        return reply({ access_token: 'google-access-token', expires_in: 3600 });
      case 'fcm.googleapis.com':
        if (fcmFailures-- > 0) return new Response('{"error":"unavailable"}', { status: 503 });
        return reply({ name: 'projects/everybodyhz-test/messages/1' });
      case 'bsky.social':
        return url.pathname.endsWith('createSession') ? reply({ accessJwt: 'bsky-jwt', did: 'did:plc:everybodyhz' }) : reply({ uri: 'at://x' });
      case 'mastodon.example':
        return reply({ id: '1' });
      case 'api.telegram.org':
        return reply({ ok: true });
      case 'hc-ping.example':
        return new Response('OK');
      default:
        throw new Error(`Unexpected request to ${url.host}`);
    }
  };

  const store = new MemoryStore();
  const deps: CheckDeps = {
    fetch: fetchFn,
    store,
    push: fcmSender(serviceAccountJson, store, fetchFn),
    posters: postersFrom(
      {
        BLUESKY_HANDLE: 'everybodyhz.bsky.social',
        BLUESKY_APP_PASSWORD: 'app-password',
        MASTODON_URL: 'https://mastodon.example',
        MASTODON_TOKEN: 'masto-token',
        TELEGRAM_BOT_TOKEN: '123:telegram-secret',
        TELEGRAM_CHAT_ID: '@everybodyhz',
      },
      fetchFn,
    ),
    siteUrl: 'https://everybodyhz.example',
    heartbeatUrl: 'https://hc-ping.example/uuid',
  };
  const fcmMessages = () => calls.filter((c) => c.host === 'fcm.googleapis.com').map((c) => (c.body as { message: Record<string, unknown> }).message);
  const posts = (host: string) => calls.filter((c) => c.host === host && !c.path.endsWith('createSession'));
  return { calls, store, deps, fcmMessages, posts };
}

describe('the minute check, on the real 28 September 2026 notice', () => {
  it('pushes a new margin notice to people who asked for every notice, and posts it everywhere', async () => {
    const w = world();
    const report = await runCheck(w.deps, new Date('2026-09-27T23:30:00Z'));
    expect(report.ok).toBe(true);
    expect(report.failed).toEqual([]);

    const [message] = w.fcmMessages();
    expect(message).toMatchObject({
      topic: 'alerts-everything',
      data: { title: 'Grid notice 16:00–19:00 today', path: '/notices/emn-20260927T232600Z', tag: 'notice-emn-20260927T232600Z', change: 'issued' },
      android: { priority: 'HIGH' },
    });
    expect(w.calls.find((c) => c.host === 'fcm.googleapis.com')?.headers.authorization).toBe('Bearer google-access-token');

    const mastodon = w.posts('mastodon.example')[0]!.body as { status: string };
    expect(mastodon.status).toBe(
      'Grid notice 16:00–19:00 today. NESO has asked generators for more headroom. Routine: these are nearly always cancelled. ' +
        'Stated shortfall 1,400 MW. Not a warning of power cuts. Nothing to do.\n\nhttps://everybodyhz.example/notices/emn-20260927T232600Z',
    );
    expect(w.posts('bsky.social')).toHaveLength(1);
    expect(w.posts('api.telegram.org')).toHaveLength(1);
    expect(w.calls.some((c) => c.host === 'hc-ping.example')).toBe(true);
  });

  it('acts once: the next minute sends nothing new', async () => {
    const w = world();
    await runCheck(w.deps, new Date('2026-09-27T23:30:00Z'));
    const before = w.calls.filter((c) => c.host !== 'data.elexon.co.uk' && c.host !== 'hc-ping.example').length;
    const again = await runCheck(w.deps, new Date('2026-09-27T23:31:00Z'));
    expect(again.sent).toEqual([]);
    expect(w.calls.filter((c) => c.host !== 'data.elexon.co.uk' && c.host !== 'hc-ping.example')).toHaveLength(before);
  });

  it('posts the midday update but does not push it', async () => {
    const w = world();
    const report = await runCheck(w.deps, new Date('2026-09-28T11:02:00Z'));
    expect(w.fcmMessages()).toEqual([]);
    expect(report.sent.map((s) => s.channel).toSorted()).toEqual(['bluesky', 'mastodon', 'telegram']);
    expect((w.posts('mastodon.example')[0]!.body as { status: string }).status).toMatch(/^Grid notice 16:00–19:00 today\. .* Stated shortfall 104 MW\./);
  });

  it('pushes the stand-down to phones and posts it', async () => {
    const w = world();
    await runCheck(w.deps, new Date('2026-09-28T14:03:00Z'));
    const [message] = w.fcmMessages();
    expect(message).toMatchObject({
      topic: 'alerts-everything',
      data: { title: 'Stood down: grid notice', change: 'cancelled', tag: 'notice-emn-20260927T232600Z' },
    });
    expect(String((message as { data: { body: string } }).data.body)).toBe(
      'The Electricity Margin Notice for 16:00–19:00 today has been cancelled.',
    );
    expect((w.posts('mastodon.example')[0]!.body as { status: string }).status).toMatch(/^Stood down: Grid notice 16:00–19:00 today\./);
  });

  it('never sends events that were already old when first seen', async () => {
    const w = world();
    const report = await runCheck(w.deps, new Date('2026-09-28T18:00:00Z'));
    expect(report.ok).toBe(true);
    expect(report.sent).toEqual([]);
  });

  it('retries a failed push on the next run without re-posting', async () => {
    const w = world({ fcmFailures: 1 });
    const first = await runCheck(w.deps, new Date('2026-09-28T14:03:00Z'));
    expect(first.failed.map((f) => f.channel)).toEqual(['push']);
    expect(first.failed[0]!.error).toBe('HTTP 503 from fcm.googleapis.com');
    const second = await runCheck(w.deps, new Date('2026-09-28T14:04:00Z'));
    expect(second.sent.map((s) => s.channel)).toEqual(['push']);
  });

  it('records a feed failure in health and skips the heartbeat, so monitoring notices', async () => {
    const w = world({ elexonDown: true });
    const report = await runCheck(w.deps, new Date('2026-09-28T14:03:00Z'));
    expect(report.ok).toBe(false);
    const health = await w.store.get<Health>('health');
    expect(health?.lastError).toContain('HTTP 503 from data.elexon.co.uk');
    expect(w.calls.some((c) => c.host === 'hc-ping.example')).toBe(false);
  });

  it('quotes each message’s own figures: the issue said 1,400 MW, the update 104 MW', async () => {
    const w = world();
    await runCheck(w.deps, new Date('2026-09-28T14:03:00Z'));
    const { noticesFrom, parseSystemWarnings } = await import('@gridwatch/core');
    const notice = noticesFrom(parseSystemWarnings(syswarn), new Date('2026-09-28T16:00:00Z'))[0]!;
    expect(noticeAt(notice, 0).shortfallMW).toBe(1400);
    expect(noticeAt(notice, 1).shortfallMW).toBe(104);
    expect(noticeAt(notice, 2).cancelled).toBe(true);
  });
});

describe('Firebase', () => {
  it('signs a valid service-account JWT', async () => {
    const account = parseServiceAccount(serviceAccountJson);
    const jwt = await signJwt(account, Date.parse('2026-09-28T12:00:00Z'));
    const [header, claims, signature] = jwt.split('.') as [string, string, string];
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, decode(signature), new TextEncoder().encode(`${header}.${claims}`));
    expect(valid).toBe(true);
    expect(JSON.parse(new TextDecoder().decode(decode(claims)))).toMatchObject({
      iss: 'push@everybodyhz-test.iam.gserviceaccount.com',
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
    });
  });

  it('targets several alert levels with one condition', async () => {
    const w = world();
    await w.deps.push!.broadcast({ title: 't', body: 'b', url: '/', tag: 'x', urgency: 'high' }, ['balanced', 'everything'], 'issued');
    const [message] = w.fcmMessages();
    expect(message).toMatchObject({
      condition: "'alerts-balanced' in topics || 'alerts-everything' in topics",
      apns: { payload: { aps: { 'interruption-level': 'time-sensitive' } } },
    });
  });

  it('refuses a key that is not a service account', () => {
    expect(() => parseServiceAccount('{"type":"authorized_user"}')).toThrow(/not a Firebase service account/);
  });
});

describe('small pieces', () => {
  it('marks Bluesky links by UTF-8 byte offsets', () => {
    const text = 'Grid notice 16:00–19:00 today.\n\nhttps://x.example/n';
    const [facet] = linkFacets(text, 'https://x.example/n');
    // The en dash is 3 bytes in UTF-8, so bytes run 2 ahead of characters.
    expect(facet!.index.byteStart).toBe(text.indexOf('https') + 2);
  });

  it('compares admin tokens in constant time, correctly', async () => {
    expect(await secretsEqual('Bearer abc', 'Bearer abc')).toBe(true);
    expect(await secretsEqual('Bearer abc', 'Bearer abd')).toBe(false);
  });
});
