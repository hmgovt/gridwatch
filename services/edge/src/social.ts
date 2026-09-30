import { request, type Fetch } from './http.ts';

/**
 * Posting each new notice to social media, in the same words as the app's
 * share card. Each platform is optional: it runs only when its secrets are set.
 * X is left out for now because its API charges for posting.
 */
export interface PostLink {
  url: string;
  title: string;
  description: string;
}

export interface Poster {
  id: string;
  post(text: string, link: PostLink, idempotencyKey: string): Promise<void>;
}

export interface SocialEnv {
  BLUESKY_HANDLE?: string;
  BLUESKY_APP_PASSWORD?: string;
  BLUESKY_SERVICE?: string;
  MASTODON_URL?: string;
  MASTODON_TOKEN?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
}

export function postersFrom(env: SocialEnv, fetchFn: Fetch): Poster[] {
  const posters: Poster[] = [];
  if (env.BLUESKY_HANDLE && env.BLUESKY_APP_PASSWORD) {
    posters.push(bluesky(env.BLUESKY_SERVICE ?? 'https://bsky.social', env.BLUESKY_HANDLE, env.BLUESKY_APP_PASSWORD, fetchFn));
  }
  if (env.MASTODON_URL && env.MASTODON_TOKEN) posters.push(mastodon(env.MASTODON_URL, env.MASTODON_TOKEN, fetchFn));
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) posters.push(telegram(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, fetchFn));
  return posters;
}

const json = (body: unknown, headers: Record<string, string> = {}) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body),
});

/** Bluesky: an app password (not the account password), a link facet and a link card. */
function bluesky(service: string, handle: string, appPassword: string, fetchFn: Fetch): Poster {
  const base = service.replace(/\/$/, '');
  return {
    id: 'bluesky',
    async post(text, link) {
      const session = (await (
        await request(fetchFn, `${base}/xrpc/com.atproto.server.createSession`, json({ identifier: handle, password: appPassword }))
      ).json()) as { accessJwt: string; did: string };
      const facets = linkFacets(text, link.url);
      await request(
        fetchFn,
        `${base}/xrpc/com.atproto.repo.createRecord`,
        json(
          {
            repo: session.did,
            collection: 'app.bsky.feed.post',
            record: {
              $type: 'app.bsky.feed.post',
              text,
              createdAt: new Date().toISOString(),
              langs: ['en-GB'],
              ...(facets.length ? { facets } : {}),
              embed: { $type: 'app.bsky.embed.external', external: { uri: link.url, title: link.title, description: link.description } },
            },
          },
          { authorization: `Bearer ${session.accessJwt}` },
        ),
      );
    },
  };
}

/** Bluesky marks links by UTF-8 byte offsets. */
export function linkFacets(text: string, url: string) {
  const at = text.indexOf(url);
  if (at < 0) return [];
  const encoder = new TextEncoder();
  const byteStart = encoder.encode(text.slice(0, at)).length;
  return [
    {
      index: { byteStart, byteEnd: byteStart + encoder.encode(url).length },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: url }],
    },
  ];
}

/** Mastodon: an access token with only the write:statuses scope. */
function mastodon(instance: string, token: string, fetchFn: Fetch): Poster {
  return {
    id: 'mastodon',
    async post(text, _link, idempotencyKey) {
      await request(
        fetchFn,
        `${instance.replace(/\/$/, '')}/api/v1/statuses`,
        json({ status: text, visibility: 'public', language: 'en' }, { authorization: `Bearer ${token}`, 'idempotency-key': idempotencyKey }),
      );
    },
  };
}

/** Telegram: a bot that is an admin of a public channel. */
function telegram(botToken: string, chatId: string, fetchFn: Fetch): Poster {
  return {
    id: 'telegram',
    async post(text, link) {
      await request(
        fetchFn,
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        json({ chat_id: chatId, text, link_preview_options: { url: link.url, prefer_small_media: true } }),
      );
    },
  };
}
