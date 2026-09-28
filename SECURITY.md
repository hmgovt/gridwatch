# Security

## Reporting a vulnerability

Please report security issues privately to **security@TODO-your-domain** (set this up before launch) rather than opening a public issue. We aim to acknowledge reports within two working days.

## How the system is protected

Mainsight is a safety-adjacent alert service, so the design keeps the attack surface small and assumes every input is hostile.

### Data we hold

We hold almost nothing worth stealing. There are no accounts, passwords, names, emails, addresses or locations. With alerts on, the server keeps a browser push address, a rota letter and an alert preference ([docs/PRIVACY.md](docs/PRIVACY.md)).

### API (`services/api`)

| Control | Where |
|---|---|
| Strict input validation: strict schemas that reject unknown fields, size limits, enum-only rota letters | `src/app.ts` |
| Push endpoints restricted to the browser vendors' push services (HTTPS, default port, no credentials) to prevent server-side request forgery | `src/push.ts` |
| Bearer tokens are 256-bit random values; only SHA-256 hashes are stored; comparisons are constant-time; wrong id and wrong token give the same 401 | `src/security.ts`, `src/app.ts` |
| Rate limits per client (salted hashes, never raw IP addresses) and per subscription for test alerts | `src/security.ts` |
| Request bodies capped at 16 KB; JSON content type required | `src/app.ts` |
| Security headers: CSP `default-src 'none'`, HSTS, `nosniff`, `no-referrer`, frame denial, CORP | `src/app.ts` |
| CORS allowlist from configuration, no credentials | `src/config.ts` |
| Parameterised SQL only | `src/db.ts` |
| Outbound feeds: HTTPS only, no redirects, 15 s timeout, 5 MB cap, JSON content type, schema-validated, text sanitised | `src/sources/` |
| Logs never contain bodies, IPs, push endpoints or tokens; subscription ids are redacted from paths | `src/log.ts` |
| Operator route for publishing a rota is disabled unless `ADMIN_TOKEN` is set, and needs a 32–128 character token | `src/app.ts` |
| Configuration validated at start-up; secrets only from the environment | `src/config.ts`, `.env.example` |

### Web app (`apps/web`)

- **Content Security Policy** with no `unsafe-inline` or `unsafe-eval`. Scripts, styles and fonts come only from our own origin. The policy is emitted as `_headers` for the static host and applied by `vite preview`, so it can be tested locally.
- **No third-party requests.** Fonts are self-hosted, and there are no analytics or tag managers.
- **No HTML injection.** Rendering is through React only; `dangerouslySetInnerHTML` is banned by lint.
- **The service worker only opens in-app paths from notifications**, which prevents open redirects, and never caches live data.
- API responses are shape-checked before use.
- **Minimal storage.** The device keeps settings and the last status. The alert token lives there too; native shells should move it to the keychain or keystore ([docs/PORTING.md](docs/PORTING.md)).

### Supply chain

- pnpm 10 blocks dependency install scripts (`onlyBuiltDependencies: []`) and refuses releases less than a day old (`minimumReleaseAge`).
- Exact versions are pinned, with a lockfile.
- Dependabot tracks npm packages and GitHub Actions.
- CI runs lint (with security rules), typecheck, tests, build and `pnpm audit`.
- **To do:** pin GitHub Actions to commit SHAs, and add CodeQL and secret scanning once the repository settings allow.

## Before launch

- Commission an independent penetration test of the API and web app.
- Put the API behind a CDN or WAF with platform-level rate limiting; the in-memory limiter is per instance.
- Keep VAPID and admin keys in a secret manager and rotate them on staff changes.
- Set up monitoring and alerting for feed failures (source health is in `/v1/status`), with an on-call rota for winter.
