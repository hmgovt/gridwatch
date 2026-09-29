import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Security headers for the built site. Emitted as `_headers` (understood by
 * Cloudflare Pages and Netlify) and applied by `vite preview` so the production
 * policy can be tested locally. Nothing is loaded from third parties.
 */
const ELEXON_ORIGIN = 'https://data.elexon.co.uk';

/** The policy shared by the website (as a header) and the native app (as a meta tag). */
function contentSecurityPolicy(connectOrigins: string[], forMeta = false): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${["'self'", ...connectOrigins].filter(Boolean).join(' ')}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    // Not allowed in a meta tag; the native app isn't framed anyway.
    ...(forMeta ? [] : ["frame-ancestors 'none'", 'upgrade-insecure-requests']),
  ].join('; ');
}

function securityHeaders(connectOrigins: string[]): Record<string, string> {
  return {
    'Content-Security-Policy': contentSecurityPolicy(connectOrigins),
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
  };
}

/** The native app is served from inside the APK, so its policy travels in the page itself. */
function cspMeta(policy: string): Plugin {
  return {
    name: 'gridwatch-csp-meta',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head' }],
  };
}

function headersFile(headers: Record<string, string>): Plugin {
  return {
    name: 'gridwatch-headers-file',
    apply: 'build',
    generateBundle() {
      const lines = ['/*', ...Object.entries(headers).map(([k, v]) => `  ${k}: ${v}`), '', '/sw.js', '  Cache-Control: no-cache', ''];
      this.emitFile({ type: 'asset', fileName: '_headers', source: lines.join('\n') });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiOrigin = env.VITE_API_BASE ? new URL(env.VITE_API_BASE).origin : '';
  // `--mode artifact` builds a self-contained scenario preview (see scripts/inline-artifact.mjs).
  const artifact = mode === 'artifact';
  // `--mode native` builds the Android app's web layer, which reads Elexon directly.
  const native = mode === 'native';
  const direct = native || env.VITE_DATA_SOURCE === 'direct';
  const connect = [apiOrigin, direct ? ELEXON_ORIGIN : ''];
  const headers = securityHeaders(connect);

  return {
    plugins: [
      react(),
      ...(artifact ? [] : native ? [cspMeta(contentSecurityPolicy(connect, true))] : [headersFile(headers)]),
    ],
    server: {
      port: 5173,
      strictPort: true,
      proxy: { '/v1': 'http://127.0.0.1:8787' },
    },
    preview: { headers },
    build: {
      outDir: artifact ? 'dist-artifact' : native ? 'dist-native' : 'dist',
      target: 'es2022',
      sourcemap: !artifact && !native,
      // The artifact build is published as one self-contained HTML file.
      assetsInlineLimit: artifact ? 10_000_000 : 4096,
      cssCodeSplit: false,
    },
    publicDir: artifact ? false : 'public',
  };
});
