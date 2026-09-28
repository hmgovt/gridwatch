import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Security headers for the built site. Emitted as `_headers` (understood by
 * Cloudflare Pages and Netlify) and applied by `vite preview` so the production
 * policy can be tested locally. Nothing is loaded from third parties.
 */
function securityHeaders(apiOrigin: string): Record<string, string> {
  const connect = ["'self'", apiOrigin].filter(Boolean).join(' ');
  return {
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data:",
      "font-src 'self'",
      `connect-src ${connect}`,
      "worker-src 'self'",
      "manifest-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      'upgrade-insecure-requests',
    ].join('; '),
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
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
  // `--mode artifact` builds a self-contained scenario preview (see scripts/inline-preview.mjs).
  const artifact = mode === 'artifact';
  const headers = securityHeaders(apiOrigin);

  return {
    plugins: [react(), ...(artifact ? [] : [headersFile(headers)])],
    server: {
      port: 5173,
      strictPort: true,
      proxy: { '/v1': 'http://127.0.0.1:8787' },
    },
    preview: { headers },
    build: {
      outDir: artifact ? 'dist-artifact' : 'dist',
      target: 'es2022',
      sourcemap: !artifact,
      // The artifact build is published as one self-contained HTML file.
      assetsInlineLimit: artifact ? 10_000_000 : 4096,
      cssCodeSplit: false,
    },
    publicDir: artifact ? false : 'public',
  };
});
