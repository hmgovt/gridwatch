import type { CapacitorConfig } from '@capacitor/cli';

/** The Android app: the web layer built with `--mode native`, in a Capacitor shell. */
const config: CapacitorConfig = {
  appId: 'uk.everybodyhz.app',
  appName: 'everybody Hz',
  webDir: 'dist-native',
  android: {
    // Only HTTPS, and no remote debugging in release builds.
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SystemBars: { insetsHandling: 'css' },
  },
};

export default config;
