import { registerPlugin, type PermissionState, type PluginListenerHandle } from '@capacitor/core';
import type { Sensitivity } from '@gridwatch/core';

/**
 * Our own Android plugin (android/app/src/main/java/uk/everybodyhz/app/GridAlertsPlugin.java):
 * schedules the background check, posts notifications, and reports taps on them.
 */
export interface GridAlertsPlugin {
  checkPermissions(): Promise<{ notifications: PermissionState }>;
  requestPermissions(): Promise<{ notifications: PermissionState }>;
  configure(options: { enabled: boolean; sensitivity: Sensitivity }): Promise<void>;
  testAlert(): Promise<void>;
  addListener(event: 'open', listener: (data: { path: string }) => void): Promise<PluginListenerHandle>;
}

export const GridAlerts = registerPlugin<GridAlertsPlugin>('GridAlerts');
