# Porting to iOS and Android

The web app is built so that the native apps are the same code in a native shell (Capacitor), with a few platform services swapped. This page lists every swap.

## What is already in place

- **Platform layer** (`apps/web/src/platform/`): storage, push and haptics sit behind interfaces. Nothing else in the app touches `localStorage`, the Push API or `navigator.vibrate` directly.
- **No cookies, no same-origin assumptions**: the API is called with bearer tokens and `credentials: 'omit'`, and its base URL comes from `VITE_API_BASE`.
- **The API's CORS list** already includes the Capacitor origins (`capacitor://localhost`, `https://localhost`) in `.env.example`.
- **Touch and layout**: 44 px minimum touch targets, safe-area insets on the top and bottom bars, no hover-only features, and reduced motion respected throughout.
- **Deep links**: every screen has a path (`/notices/:id`, `/settings`), and push payloads carry an in-app path only.

## Steps

```sh
cd apps/web
pnpm add @capacitor/core @capacitor/preferences @capacitor/push-notifications @capacitor/haptics
pnpm add -D @capacitor/cli
npx cap init Mainsight uk.co.example.mainsight --web-dir dist
VITE_API_BASE=https://api.example.org pnpm build
npx cap add ios && npx cap add android
npx cap sync
```

Then implement the native versions of the platform interfaces and choose them at runtime with `Capacitor.isNativePlatform()`:

| Interface | Web (today) | Native |
|---|---|---|
| `KeyValueStore` | `localStorage` | `@capacitor/preferences` for settings. Keep the alert token in the Keychain (iOS) or Keystore (Android) with a secure-storage plugin. |
| `PushPlatform` | Push API + VAPID via `sw.js` | `@capacitor/push-notifications`. The device registers for an APNs or FCM token. |
| `tap()` | `navigator.vibrate` | `@capacitor/haptics` `impact({ style: 'light' })` |
| Service worker | offline shell and push | Not used in the native shells: bundled assets are already offline, and push is native. |

## Server changes for native push

The subscription API already takes a `channel` field; only `webpush` is implemented. To add native push:

1. Accept `channel: 'fcm'` (Android) and `'apns'` (iOS) with a device token instead of a push endpoint. Validate the token format.
2. Add FCM (HTTP v1 API with a service-account key) and APNs (token-based `.p8` key) senders behind the existing `PushSender` interface.
3. Keep payloads to the same `Alert` shape: title, body, in-app path, tag and urgency. Map urgency `high` to APNs `interruption-level: time-sensitive` and to a high-priority FCM notification channel.

## Store listings

- **Apple App Store privacy label:** no data used to track you. "Identifiers" is not collected. The push token is used for app functionality only and is not linked to identity.
- **Google Play data safety:** device or other IDs (the push token), collected for app functionality, not shared, and deletable in-app.
- **Guideline notes:** don't overclaim prediction accuracy in the listing or the app. Keep "not affiliated with NESO or National Grid" visible. Both stores look closely at apps offering safety alerts.
