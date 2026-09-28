# Mainsight (working name)

Plain-English early warning of power disruption in Great Britain.

Mainsight watches the grid operator's official warnings and tells each household, in one word, what they mean for them: **All clear**, **Heads-up**, **Get ready** or **Power off**. If rotating power cuts are ever used, it matches the published rota to the user's rota letter and gives exact times.

The repository is named `gridwatch`; the product name lives in `apps/web/src/brand.ts`, `apps/web/index.html` and `apps/web/public/manifest.webmanifest`, so it can change without touching anything else.

## What's here

| Path | What it is |
|---|---|
| `packages/core` | Pure TypeScript domain logic shared by every client and the server: notice parsing and lifecycles, headroom forecasts, rota letters, the household status rules and the push alert rules. No dependencies. |
| `apps/web` | The app: a React PWA built to be wrapped as iOS and Android apps with Capacitor ([docs/PORTING.md](docs/PORTING.md)). |
| `services/api` | Ingestion from Elexon BMRS, a raw data archive, the status API and Web Push fan-out. Hono on Node, SQLite storage. |
| `docs/` | Architecture, security, privacy, data sources, porting and the launch checklist. |

## Quick start

Needs Node 22.18+ and pnpm 10 (`corepack enable` sets it up).

```sh
pnpm install
pnpm dev            # web on http://localhost:5173, API on http://localhost:8787
```

With no network access to Elexon, the app says it can't confirm live status (it never invents data). Scenario previews work offline: open **Settings → Preview a situation**, or add `?scenario=emn-2026-09-28` (also `calm`, `hrdr`, `rotation`, `rotation-live`) to the URL.

Useful scripts:

```sh
pnpm check                              # lint, typecheck, test and build everything
pnpm --filter @gridwatch/api ingest:once  # fetch every feed once and print what was understood
pnpm --filter @gridwatch/api vapid:generate  # create Web Push keys
pnpm build:artifact                     # single-file scenario preview (apps/web/artifact/mainsight.html)
pnpm icons                              # re-render PNG icons from the SVGs
```

## Design principles

- **Colour means household action, never drama.** A margin notice leaves the household "All clear", matching NESO's own message that it is not a warning of power cuts. Amber, orange and red are reserved for things that need doing.
- **Say where it came from.** Every status links back to the official notice, its history and its source. Scenarios are always labelled, and the one real replay says so.
- **Never guess.** If live data is stale the app says "Checking" or "We can't confirm right now" and points to 105.
- **Private by design.** No accounts, no location, no analytics. See [docs/PRIVACY.md](docs/PRIVACY.md).

## Status

This is a working foundation, not a launched service. The main things to finish before launch are in [docs/LAUNCH-CHECKLIST.md](docs/LAUNCH-CHECKLIST.md). In particular, the Elexon endpoints and field names in `services/api/src/sources/elexon.ts` were written against Elexon's published API but could not be tested against the live service from the build environment ([docs/DATA-SOURCES.md](docs/DATA-SOURCES.md)).

Mainsight is independent and not affiliated with NESO, National Grid, Elexon or any network operator. In a power cut, call 105.
