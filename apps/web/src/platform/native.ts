import { registerPlugin, type PermissionState, type PluginListenerHandle } from '@capacitor/core';
import type { Sensitivity } from '@gridwatch/core';

/** What the Android background check last did, for the Settings screen. */
export interface BackgroundStatus {
  enabled: boolean;
  permission: PermissionState;
  /** Epoch milliseconds, or null if it hasn't run yet. */
  lastCheckAt: number | null;
  /** "ok", "notified 2", or a short error. */
  lastResult: string | null;
}

/**
 * Our own Android plugin (android/app/src/main/java/uk/everybodyhz/app/GridAlertsPlugin.java):
 * schedules the background check, posts notifications, and reports taps on them.
 *
 * Never return `GridAlerts` from an async function or a `.then()`: it answers
 * every property, including `then`, so promises mistake it for a thenable.
 * See `withPlugin` in alerts.ts.
 */
export interface GridAlertsPlugin {
  checkPermissions(): Promise<{ notifications: PermissionState }>;
  requestPermissions(): Promise<{ notifications: PermissionState }>;
  configure(options: { enabled: boolean; sensitivity: Sensitivity }): Promise<void>;
  testAlert(): Promise<void>;
  openSettings(): Promise<void>;
  status(): Promise<BackgroundStatus>;
  addListener(event: 'open', listener: (data: { path: string }) => void): Promise<PluginListenerHandle>;
}

export const GridAlerts = registerPlugin<GridAlertsPlugin>('GridAlerts');
