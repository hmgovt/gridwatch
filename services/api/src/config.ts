import { z } from 'zod';

const bool = z
  .enum(['true', 'false', 'on', 'off', '1', '0'])
  .transform((v) => v === 'true' || v === 'on' || v === '1');

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  HOST: z.string().default('127.0.0.1'),
  ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),
  DATA_DIR: z.string().default('./data'),
  INGEST: bool.default(true),
  TRUST_PROXY: bool.default(false),
  ELEXON_BASE_URL: z.url().default('https://data.elexon.co.uk/bmrs/api/v1'),
  VAPID_PUBLIC_KEY: z.string().default(''),
  VAPID_PRIVATE_KEY: z.string().default(''),
  VAPID_SUBJECT: z.string().default('mailto:alerts@example.org'),
  ADMIN_TOKEN: z
    .string()
    .default('')
    .refine(
      (t) => t === '' || /^[A-Za-z0-9_-]{32,128}$/.test(t),
      'ADMIN_TOKEN must be 32-128 URL-safe characters (letters, digits, - and _)',
    ),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = schema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${problems}`);
  }
  return result.data;
}
