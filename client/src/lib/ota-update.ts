// Self-hosted OTA update check for the kiosk APK.
//
// Manifest is served by the v0-payment-system-kiosk Next.js app at
// https://tcpdca.com/api/kiosk-update/manifest with shape:
//   { version: "1.0.1", url: "https://tcpdca.com/kiosk-bundles/v1.0.1.zip", checksum: "<sha256>" }
//
// On launch we ask Capacitor what bundle it's running, compare to the manifest,
// download + apply if newer, and notify the app is ready so the plugin doesn't
// roll back on the next boot.
//
// Failure mode: if anything goes wrong (offline, parse error, hash mismatch),
// we log and swallow. The currently-installed bundle keeps running.

import { CapacitorUpdater } from "@capgo/capacitor-updater";
import { setKioskVersion } from "./error-reporter";

const MANIFEST_URL = "https://tcpdca.com/api/kiosk-update/manifest";

interface Manifest {
  version: string;
  url: string;
  checksum: string;
}

function isWeb(): boolean {
  // The plugin throws in pure-web preview. Best-effort sniff for Capacitor's bridge.
  return typeof (window as any).Capacitor?.isNativePlatform !== "function"
    ? true
    : !(window as any).Capacitor.isNativePlatform();
}

export async function initOtaCheck(): Promise<void> {
  try {
    // Tell the plugin that the app booted successfully, so it doesn't auto-roll back.
    await CapacitorUpdater.notifyAppReady();
  } catch (err) {
    // notifyAppReady throws when there's no native plugin (web preview, dev server).
    if (!isWeb()) console.warn("[ota] notifyAppReady failed", err);
  }

  if (isWeb()) return;

  try {
    const current = await CapacitorUpdater.current();
    setKioskVersion({ bundle: current.bundle.version });
  } catch (err) {
    console.warn("[ota] could not read current bundle version", err);
  }

  try {
    const res = await fetch(MANIFEST_URL, { cache: "no-store" });
    if (!res.ok) {
      console.warn("[ota] manifest fetch failed:", res.status);
      return;
    }
    const manifest = (await res.json()) as Manifest;
    if (!manifest.version || !manifest.url) {
      console.warn("[ota] malformed manifest", manifest);
      return;
    }

    const current = await CapacitorUpdater.current();
    if (current.bundle.version === manifest.version) {
      // Already on the latest bundle.
      return;
    }

    console.log(
      `[ota] new bundle available: ${current.bundle.version} → ${manifest.version}`
    );

    const downloadOpts: { url: string; version: string; checksum?: string } = {
      url: manifest.url,
      version: manifest.version,
    };
    if (manifest.checksum) downloadOpts.checksum = manifest.checksum;

    const next = await CapacitorUpdater.download(downloadOpts);
    await CapacitorUpdater.next({ id: next.id });
    console.log("[ota] queued bundle for next launch:", next.id);
  } catch (err) {
    console.warn("[ota] update check failed:", err);
  }
}
