/**
 * Outbound HTTP for data feeds: HTTPS only, hard timeout, response size cap,
 * JSON content type required. Feeds are treated as untrusted input.
 */

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export interface FetchedJson {
  url: string;
  status: number;
  body: string;
  json: unknown;
}

const MAX_BYTES = 5 * 1024 * 1024;

export async function fetchJson(fetcher: Fetcher, url: string, timeoutMs = 15_000): Promise<FetchedJson> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error(`Refusing non-HTTPS feed URL: ${parsed.host}`);

  const response = await fetcher(url, {
    headers: { accept: 'application/json', 'user-agent': 'gridwatch-ingest/0.1 (+https://github.com/hmgovt/gridwatch)' },
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${parsed.host}${parsed.pathname}`);

  const type = response.headers.get('content-type') ?? '';
  if (!type.includes('json')) throw new Error(`Unexpected content type "${type}" from ${parsed.host}`);

  const declared = Number(response.headers.get('content-length') ?? '0');
  if (declared > MAX_BYTES) throw new Error(`Response too large from ${parsed.host}`);
  const body = await readCapped(response, MAX_BYTES);
  return { url, status: response.status, body, json: JSON.parse(body) };
}

async function readCapped(response: Response, max: number): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw new Error('Response exceeded size limit');
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
