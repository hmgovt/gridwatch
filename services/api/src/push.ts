import webpush from 'web-push';
import type { Alert } from '@gridwatch/core';

/**
 * Push endpoints are URLs supplied by clients, and the server makes requests
 * to them. To prevent server-side request forgery we only ever contact the
 * browser vendors' push services, over HTTPS on the default port.
 */
const PUSH_HOSTS = [
  'fcm.googleapis.com', // Chrome, Edge on Android, Samsung Internet
  'updates.push.services.mozilla.com', // Firefox
  'web.push.apple.com', // Safari and iOS home-screen apps
];
const PUSH_HOST_SUFFIXES = ['.notify.windows.com']; // Edge on Windows (WNS)

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.includes(host) || PUSH_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type PushResult = 'sent' | 'gone' | 'failed';

export interface PushSender {
  readonly enabled: boolean;
  send(target: PushTarget, alert: Alert): Promise<PushResult>;
}

export function webPushSender(options: { publicKey: string; privateKey: string; subject: string }): PushSender {
  if (!options.publicKey || !options.privateKey) {
    return { enabled: false, send: async () => 'failed' };
  }
  const vapidDetails = { subject: options.subject, publicKey: options.publicKey, privateKey: options.privateKey };
  return {
    enabled: true,
    async send(target, alert) {
      if (!isAllowedPushEndpoint(target.endpoint)) return 'gone';
      try {
        await webpush.sendNotification(
          { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
          JSON.stringify(alert),
          {
            vapidDetails,
            TTL: alert.urgency === 'high' ? 3 * 3600 : 12 * 3600,
            urgency: alert.urgency,
            topic: topicFor(alert.tag),
            timeout: 10_000,
          },
        );
        return 'sent';
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        return status === 404 || status === 410 ? 'gone' : 'failed';
      }
    },
  };
}

/** Web Push topics must be at most 32 URL-safe base64 characters. */
function topicFor(tag: string): string {
  return tag.replace(/[^A-Za-z0-9_-]/g, '').slice(-32);
}
