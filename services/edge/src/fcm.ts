import type { Alert, Sensitivity } from '@gridwatch/core';
import { request, type Fetch } from './http.ts';
import type { StateStore } from './store.ts';

/**
 * Firebase Cloud Messaging (HTTP v1) with topics. Phones subscribe to
 * `alerts-<level>` themselves; we send one message per alert to every level
 * that should hear it. Firebase delivers to Android directly and to iPhones
 * through Apple's push service. We never see or store a device token.
 */
export const topicFor = (sensitivity: Sensitivity) => `alerts-${sensitivity}`;

export interface PushSender {
  /** Send to every phone subscribed at one of these levels. */
  broadcast(alert: Alert, audience: Sensitivity[], change: string): Promise<void>;
  /** Send to one device, for testing a phone end to end. */
  toDevice(token: string, alert: Alert): Promise<void>;
}

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

export function parseServiceAccount(json: string): ServiceAccount {
  const value = JSON.parse(json) as Partial<ServiceAccount>;
  if (!value.project_id || !value.client_email || !value.private_key?.includes('PRIVATE KEY')) {
    throw new Error('FCM_SERVICE_ACCOUNT is not a Firebase service account key');
  }
  return value as ServiceAccount;
}

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const TOKEN_KEY = 'fcm:access-token';

export function fcmSender(serviceAccountJson: string, store: StateStore, fetchFn: Fetch, clock: () => Date = () => new Date()): PushSender {
  const account = parseServiceAccount(serviceAccountJson);
  const endpoint = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`;

  async function accessToken(): Promise<string> {
    const now = clock().getTime();
    const cached = await store.get<{ token: string; expiresAt: number }>(TOKEN_KEY);
    if (cached && cached.expiresAt - now > 5 * 60_000) return cached.token;
    const assertion = await signJwt(account, now);
    const response = await request(fetchFn, TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
    });
    const body = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new Error('Google returned no access token');
    await store.put(TOKEN_KEY, { token: body.access_token, expiresAt: now + (body.expires_in ?? 3600) * 1000 });
    return body.access_token;
  }

  async function send(target: { topic: string } | { condition: string } | { token: string }, alert: Alert, change: string) {
    const urgent = alert.urgency === 'high';
    const message = {
      ...target,
      // Data only, so the app shows it with its own channels and de-duplication.
      data: { title: alert.title, body: alert.body, path: alert.url, tag: alert.tag, urgency: alert.urgency, change },
      android: { priority: 'HIGH', ttl: urgent ? '1800s' : '7200s' },
      apns: {
        headers: { 'apns-priority': '10', 'apns-collapse-id': `${alert.tag}:${change}`.slice(0, 64) },
        payload: {
          aps: {
            alert: { title: alert.title, body: alert.body },
            sound: 'default',
            'interruption-level': urgent ? 'time-sensitive' : 'active',
            'thread-id': alert.tag,
          },
          path: alert.url,
        },
      },
    };
    await request(fetchFn, endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' },
      body: JSON.stringify({ message }),
    });
  }

  return {
    async broadcast(alert, audience, change) {
      if (audience.length === 0) return;
      const topics = audience.map(topicFor);
      const target = topics.length === 1 ? { topic: topics[0]! } : { condition: topics.map((t) => `'${t}' in topics`).join(' || ') };
      await send(target, alert, change);
    },
    async toDevice(token, alert) {
      await send({ token }, alert, 'test');
    },
  };
}

// --- A service-account JWT, signed with WebCrypto (RS256) -------------------

function base64url(bytes: Uint8Array | string): string {
  const data = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  let binary = '';
  for (const b of data) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const raw = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

export async function signJwt(account: ServiceAccount, nowMs: number): Promise<string> {
  const iat = Math.floor(nowMs / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({ iss: account.client_email, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 }));
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(account.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`));
  return `${header}.${claims}.${base64url(new Uint8Array(signature))}`;
}
