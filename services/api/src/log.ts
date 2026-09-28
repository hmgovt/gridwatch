/**
 * Minimal structured logger. By design it has no way to log request bodies,
 * headers, IP addresses, push endpoints or tokens: callers pass a small set of
 * fields and anything that looks like a secret is redacted.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';
type Fields = Record<string, string | number | boolean | null | undefined>;

const SECRET_KEYS = /token|secret|auth|endpoint|p256dh|password|ip/i;

function write(level: Level, message: string, fields: Fields = {}): void {
  if (level === 'debug' && process.env.LOG_LEVEL !== 'debug') return;
  if (process.env.VITEST && level !== 'error') return;
  const safe: Fields = {};
  for (const [key, value] of Object.entries(fields)) safe[key] = SECRET_KEYS.test(key) ? '[redacted]' : value;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg: message, ...safe });
  if (level === 'error' || level === 'warn') process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

export const log = {
  debug: (m: string, f?: Fields) => write('debug', m, f),
  info: (m: string, f?: Fields) => write('info', m, f),
  warn: (m: string, f?: Fields) => write('warn', m, f),
  error: (m: string, f?: Fields) => write('error', m, f),
};

/** Replace ids in a path so logs can't be joined to a subscription. */
export function redactPath(path: string): string {
  return path.replace(/\/subscriptions\/[^/]+/, '/subscriptions/:id').replace(/\/notices\/[^/]+/, '/notices/:id');
}
