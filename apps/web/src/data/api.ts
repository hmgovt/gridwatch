import type { Sensitivity, StatusSnapshot } from '@gridwatch/core';
import type { PushSubscriptionData } from '../platform/push.ts';

/** Same origin by default (proxied in development); set VITE_API_BASE for a separate API host or native shells. */
const BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(10_000),
      headers: { accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers },
    });
  } catch {
    throw new ApiError(0, 'Can’t reach the everybody Hz service. Check your connection.');
  }
  if (response.status === 204) return undefined as T;
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new ApiError(response.status, body.error ?? `Request failed (${response.status})`);
  return body as T;
}

/** Light shape check: the API is our own, but we still treat responses as untrusted input. */
function isSnapshot(value: unknown): value is StatusSnapshot {
  const v = value as Partial<StatusSnapshot> | null;
  return !!v && typeof v === 'object' && Array.isArray(v.notices) && Array.isArray(v.headroom) && Array.isArray(v.sources) && typeof v.generatedAt === 'string';
}

export const api = {
  async status(): Promise<StatusSnapshot> {
    const body = await request<unknown>('/v1/status');
    if (!isSnapshot(body)) throw new ApiError(502, 'The status response was not in the expected format');
    return body;
  },
  publicKey: () => request<{ publicKey: string }>('/v1/push/public-key'),
  subscribe: (subscription: PushSubscriptionData, prefs: { rotaLetter: string | null; sensitivity: Sensitivity }) =>
    request<{ id: string; token: string }>('/v1/push/subscriptions', {
      method: 'POST',
      body: JSON.stringify({ channel: 'webpush', subscription, rotaLetter: prefs.rotaLetter, sensitivity: prefs.sensitivity }),
    }),
  updatePrefs: (id: string, token: string, prefs: { rotaLetter: string | null; sensitivity: Sensitivity }) =>
    request<void>(`/v1/push/subscriptions/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify(prefs),
    }),
  unsubscribe: (id: string, token: string) =>
    request<void>(`/v1/push/subscriptions/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } }),
  testAlert: (id: string, token: string) =>
    request<{ result: string }>(`/v1/push/subscriptions/${encodeURIComponent(id)}/test`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    }),
};
