# everybody Hz

Early warning of power cuts in Great Britain, in plain English.

everybody Hz reads the grid operator's official warnings as they're published and tells each household, in one word, what they mean for them: **All clear**, **Heads-up**, **Get ready** or **Power off**. If rotating power cuts are ever used, it matches the published rota to the user's rota letter and gives exact times.

The repository is named `gridwatch`. The product name lives in `apps/web/src/brand.ts`, `apps/web/index.html`, `apps/web/public/manifest.webmanifest` and the Android app's `strings.xml` and `capacitor.config.ts`. How it's written, and how it sounds, is set out in [docs/VOICE.md](docs/VOICE.md).

## What's here

| Path | What it is |
|---|---|
| `packages/core` | Pure TypeScript domain logic shared by every client and the server: Elexon feed parsing, notice lifecycles, headroom forecasts, rota letters, the household status rules and the alert rules. No dependencies. |
| `apps/web` | The app: a React PWA, and the same code in a Capacitor shell for Android (`apps/web/android`). |
| `services/api` | Ingestion from Elexon BMRS, a raw data archive, the status API and Web Push fan-out. Hono on Node, SQLite storage. |
| `docs/` | Architecture, Android, security, privacy, data sources, voice and the launch checklist. |

## Quick start

Needs Node 22.18+ and pnpm 10 (`corepack enable` sets it up).

```sh
pnpm install
pnpm dev            # web on http://localhost:5173, API on http://localhost:8787
```

Scenario previews work offline: open **Settings → Preview a situation**, or add `?scenario=emn-2026-09-28` (a replay of NESO's real messages from that day) to the URL. The others are `calm`, `hrdr`, `rotation` and `rotation-live`.

Useful scripts:

```sh
pnpm check                                   # lint, typecheck, test and build everything
pnpm android:apk                             # build the Android test APK (needs JDK 21 and the Android SDK)
pnpm --filter @gridwatch/api ingest:once     # fetch every feed once and print what was understood
pnpm --filter @gridwatch/api vapid:generate  # create Web Push keys
pnpm build:artifact                          # single-file scenario preview (apps/web/artifact/everybody-hz.html)
pnpm icons                                   # regenerate every icon, web and Android, from one drawing
```

## Design principles

- **Colour means household action, never drama.** A margin notice leaves the household "All clear", matching NESO's own message that it is not a warning of power cuts. Amber, orange and red are reserved for things that need doing.
- **Say where it came from.** Every status links back to the official notice, its history and NESO's own wording. Scenarios are always labelled, and the one real replay says so.
- **Never guess.** If live data is stale, the app says "Checking" or "We can't confirm right now" and points to 105.
- **Private by design.** No accounts, no location, no analytics. See [docs/PRIVACY.md](docs/PRIVACY.md).

## Status

This is a working test build, not a launched service. The Elexon adapters were checked against the live service on 29 September 2026, with every system warning since May 2023 ([docs/DATA-SOURCES.md](docs/DATA-SOURCES.md)). The Android test APK is described in [docs/ANDROID.md](docs/ANDROID.md). What's left before launch is in [docs/LAUNCH-CHECKLIST.md](docs/LAUNCH-CHECKLIST.md).

everybody Hz is independent and not affiliated with NESO, National Grid, Elexon, Hertz or any network operator. In a power cut, call 105.
