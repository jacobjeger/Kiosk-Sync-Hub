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
import { reportEvent, flushEvents } from "@/lib/commands";

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

export async function checkForUpdate(): Promise<void> {
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
    /* Report it before applying. A bundle swap replaces this context, and a
       *downgrade* is the case worth surfacing: a stale published manifest will
       happily replace a freshly installed APK's bundle with an older one and
       say nothing, which is precisely what happened the first time a tablet was
       provisioned. It is not a bug in the update logic — publishing an older
       version is how a rollback is done — but it should never again be silent. */
    reportEvent("bundle_changed", { from: current.bundle?.version ?? null, to: manifest.version });
    await flushEvents();

    await CapacitorUpdater.set({ id: next.id });
  } catch (err) {
    console.warn("[ota] update check failed:", err);
  }
}

export async function initOtaCheck(): Promise<void> {
  /* notifyAppReady() is deliberately NOT called here.
     Capgo reverts to the previous bundle if it is not called within
     appReadyTimeout. Calling it at boot means that safety net only catches "the
     bundle fails to start" — it cannot catch "the bundle starts fine and cannot
     reach the API", which is exactly how a repoint fails. markBundleHealthy()
     is called from the first successful server response instead, with
     confirmIfOffline() covering the tablet that has no network at all. */
  confirmIfOffline();

  if (isWeb()) return;

  try {
    const current = await CapacitorUpdater.current();
    setKioskVersion({ bundle: current.bundle.version });
  } catch (err) {
    console.warn("[ota] could not read current bundle version", err);
  }

  // First check happens shortly after boot; subsequent checks on a timer.
  setTimeout(() => void checkForUpdate(), 5_000);
  setInterval(() => void checkForUpdate(), UPDATE_POLL_INTERVAL_MS);
}


/* ---------------------------------------------------------------------------
 * Confirming a bundle actually works
 * ------------------------------------------------------------------------ */

let confirmed = false;

/**
 * Tell Capgo this bundle is good.
 *
 * Called from the first successful server response, not from boot. A bundle
 * that renders perfectly and cannot talk to the server is broken in the way
 * that matters, and confirming it at startup would have thrown away the
 * automatic rollback that catches precisely that.
 *
 * The offline case is why the timer exists: a tablet with no network will never
 * see a successful response, and rolling back a perfectly good bundle because
 * the canteen's router is down would be worse than the problem.
 */
export async function markBundleHealthy(): Promise<void> {
  if (confirmed || isWeb()) return;
  confirmed = true;
  try {
    await CapacitorUpdater.notifyAppReady();
    console.log("[ota] bundle confirmed");
  } catch (err) {
    console.warn("[ota] could not confirm bundle:", err);
  }
}

/** Confirm anyway if we are plainly offline and nothing will ever answer. */
export function confirmIfOffline(afterMs = 45_000): void {
  if (isWeb()) return;
  setTimeout(() => {
    if (!confirmed && typeof navigator !== "undefined" && navigator.onLine === false) {
      console.log("[ota] offline at startup — confirming bundle to avoid a needless rollback");
      void markBundleHealthy();
    }
  }, afterMs);
}
