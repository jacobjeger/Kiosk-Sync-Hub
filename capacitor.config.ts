import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.pdca.kiosk",
  appName: "PDCA Payment Kiosk",
  webDir: "dist/public",
  server: {
    androidScheme: "https",
  },
  plugins: {
    CapacitorUpdater: {
      // Don't let Capgo's SaaS poller race our self-hosted check. We drive all
      // OTA decisions from client/src/lib/ota-update.ts.
      autoUpdate: false,
      // Give the new bundle 60s to call notifyAppReady. The default 10s isn't
      // enough on slower kiosk tablets where IndexedDB upgrades + Capacitor
      // bridge init can chew a few seconds before our main.tsx runs.
      appReadyTimeout: 60000,
      responseTimeout: 30000,
      // Don't wipe IndexedDB / localStorage on bundle swap. Critical: offline
      // transactions, cash payments, and member cache must survive updates.
      resetWhenUpdate: false,
      keepUrlPathAfterReload: true,
    },
  },
  android: {
    // Pipe console.log/error from the WebView into logcat in release builds
    // too. We need this for diagnosing crashes on field tablets; the privacy
    // cost is low because the kiosk doesn't display PII on the console.
    loggingBehavior: "production",
    webContentsDebuggingEnabled: true,
    buildOptions: {
      keystorePath: undefined,
      keystorePassword: undefined,
      keystoreAlias: undefined,
      keystoreAliasPassword: undefined,
      signingType: "apksigner",
    },
  },
};

export default config;
