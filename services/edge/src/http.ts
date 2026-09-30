/** Outbound HTTP: HTTPS only, a hard timeout, a size cap, and errors that never include secrets. */

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const MAX_BYTES = 2 * 1024 * 1024;

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function request(fetchFn: Fetch, url: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<Response> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error(`Refusing non-HTTPS request to ${parsed.host}`);
  // Workers don't support redirect: 'error'; take redirects manually and refuse them.
  const response = await fetchFn(url, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), ...init });
  if (response.status >= 300 && response.status < 400) throw new HttpError(response.status, `Refusing redirect from ${parsed.host}`);
  if (!response.ok) {
    // Only the status and host: error bodies can echo what we sent, and some
    // APIs (Telegram) carry the secret in the path.
    throw new HttpError(response.status, `HTTP ${response.status} from ${parsed.host}`);
  }
  return response;
}

export async function readText(response: Response): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (declared > MAX_BYTES) throw new Error('Response too large');
  const text = await response.text();
  if (text.length > MAX_BYTES) throw new Error('Response too large');
  return text;
}

export async function getJson(fetchFn: Fetch, url: string): Promise<{ body: string; json: unknown }> {
  const response = await request(fetchFn, url, { headers: { accept: 'application/json', 'user-agent': 'everybodyhz/0.1 (+https://github.com/hmgovt/gridwatch)' } });
  if (!(response.headers.get('content-type') ?? '').includes('json')) throw new Error('Unexpected content type');
  const body = await readText(response);
  return { body, json: JSON.parse(body) as unknown };
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Compare secrets without leaking their length or content through timing. */
export async function secretsEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}
