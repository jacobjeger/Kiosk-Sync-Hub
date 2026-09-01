import { db } from "@/lib/db";
import { tryNative } from "@/lib/kiosk-device";
import { APP_VERSION, currentBundleVersion } from "@/lib/version";

/**
 * What the tablet says about itself on every check-in.
 *
 * The one field worth naming is `pending_tx_count`. It is how the fleet page
 * shows sales sitting in a tablet's offline queue — and it is what has to be
 * zero before anybody factory resets that tablet, because the reset destroys
 * the queue. That is the only genuine data-loss risk in the whole rollout, and
 * this is the number that prevents it.
 */
export async function telemetry(): Promise<Record<string, unknown>> {
  const status = await tryNative((p) => p.getStatus());

  let pending = 0;
  try {
    pending = await db.offlineTransactions.where("status").equals("pending").count();
  } catch {
    // A Dexie failure must not stop the check-in; the rest is still useful.
  }

  return {
    app_version: APP_VERSION,
    bundle_version: currentBundleVersion(),
    android_release: status?.androidRelease ?? null,
    model: status?.model ?? null,
    battery_pct: status && status.batteryPct >= 0 ? status.batteryPct : null,
    // Null rather than false on a build with no native half: "we cannot tell"
    // and "definitely not provisioned" are different, and the fleet page shows
    // them differently.
    is_device_owner: status ? status.isDeviceOwner : null,
    in_lock_task: status ? status.inLockTask : null,
    pending_tx_count: pending,
    ...network(),
  };
}

/**
 * What the WebView knows about the connection.
 *
 * The Network Information API is unevenly implemented and its numbers are
 * estimates rather than measurements — but they are the only ones available
 * from inside a WebView, and what matters here is the shape of the trend, not
 * the absolute value. The reliability figure on the fleet page is counted
 * server-side from actual check-ins and is the number to trust.
 */
function network(): Record<string, unknown> {
  const c = (navigator as unknown as {
    connection?: { type?: string; effectiveType?: string; downlink?: number; rtt?: number };
  }).connection;

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { network_type: "none" };
  }
  if (!c) return { network_type: "unknown" };

  return {
    // `type` is the honest one (wifi/cellular); `effectiveType` is a speed
    // bucket (4g/3g) that gets mistaken for it.
    network_type: c.type ?? (c.effectiveType ? `~${c.effectiveType}` : "unknown"),
    network_downlink: typeof c.downlink === "number" ? c.downlink : null,
    network_rtt_ms: typeof c.rtt === "number" ? c.rtt : null,
  };
}
