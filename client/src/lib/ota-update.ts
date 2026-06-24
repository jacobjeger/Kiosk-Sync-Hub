// Self-hosted OTA update check for the kiosk APK.
//
// Manifest is served by the v0-payment-system-kiosk Next.js app at
// https://tcpdca.com/api/kiosk-update/manifest with shape:
//   { version: "1.0.1", url: "https://tcpdca.com/kiosk-bundles/v1.0.1.zip", checksum: "<sha256>" }
//
// Kiosk mode means the app never backgrounds, so CapacitorUpdater.next()
// (which only applies on next foreground) would never trigger. We use
// CapacitorUpdater.set({ id }) instead, which swaps the bundle and reloads
// the WebView immediately. A brief reload is acceptable; the kiosk is rarely
// mid-transaction during an idle poll.
//
// We poll periodically (every UPDATE_POLL_INTERVAL_MS) so a freshly-published
// OTA bundle reaches every device within ~15 minutes without anyone touching
// the tablet. To avoid yanking the screen out from under a paying member, we
// only apply when the page looks idle.
//
// Failure mode: if anything goes wrong (offline, parse error, hash mismatch),
// we log and swallow. The currently-installed bundle keeps running.

import { CapacitorUpdater } from "@capgo/capacitor-updater";
import { setKioskVersion } from "./error-reporter";

const MANIFEST_URL = "https://tcpdca.com/api/kiosk-update/manifest";
const UPDATE_POLL_INTERVAL_MS = 15 * 60 * 1000;        // 15 minutes
const IDLE_BEFORE_APPLY_MS = 30 * 1000;                // 30s with no input

interface Manifest {
  version: string;
  url: string;
  checksum: string;
}

let lastInteractionAt = Date.now();
function trackInteraction() {
  lastInteractionAt = Date.now();
}
if (typeof window !== "undefined") {
  for (const evt of ["touchstart", "mousedown", "keydown"]) {
    window.addEventListener(evt, trackInteraction, { passive: true });
  }
}

async function waitUntilIdle(): Promise<void> {
  while (Date.now() - lastInteractionAt < IDLE_BEFORE_APPLY_MS) {
    const remaining = IDLE_BEFORE_APPLY_MS - (Date.now() - lastInteractionAt);
    await new Promise((r) => setTimeout(r, Math.max(remaining, 500)));
  }
}

function isWeb(): boolean {
  // The plugin throws in pure-web preview. Best-effort sniff for Capacitor's bridge.
  return typeof (window as any).Capacitor?.isNativePlatform !== "function"
    ? true
    : !(window as any).Capacitor.isNativePlatform();
}

async function checkAndApplyOnce(): Promise<void> {
  if (isWeb()) return;
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
    if (current.bundle.version === manifest.version) return;

    console.log(
      `[ota] new bundle available: ${current.bundle.version} → ${manifest.version}`
    );

    const downloadOpts: { url: string; version: string; checksum?: string } = {
      url: manifest.url,
      version: manifest.version,
    };
    if (manifest.checksum) downloadOpts.checksum = manifest.checksum;

    const next = await CapacitorUpdater.download(downloadOpts);
    console.log("[ota] bundle downloaded, waiting for idle:", next.id);

    // Kiosk mode never backgrounds, so `next()` would never apply. `set()`
    // reloads the WebView immediately; we just wait until the screen is idle
    // so we don't reload mid-transaction.
    await waitUntilIdle();
    console.log("[ota] activating bundle:", next.id);
    await CapacitorUpdater.set({ id: next.id });
  } catch (err) {
    console.warn("[ota] update check failed:", err);
  }
}

export async function initOtaCheck(): Promise<void> {
  try {
    // Tell the plugin that the app booted successfully, so it doesn't auto-roll back.
    await CapacitorUpdater.notifyAppReady();
  } catch (err) {
    if (!isWeb()) console.warn("[ota] notifyAppReady failed", err);
  }

  if (isWeb()) return;

  try {
    const current = await CapacitorUpdater.current();
    setKioskVersion({ bundle: current.bundle.version });
  } catch (err) {
    console.warn("[ota] could not read current bundle version", err);
  }

  // First check happens shortly after boot; subsequent checks on a timer.
  setTimeout(() => void checkAndApplyOnce(), 5_000);
  setInterval(() => void checkAndApplyOnce(), UPDATE_POLL_INTERVAL_MS);
}
