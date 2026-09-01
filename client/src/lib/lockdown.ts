import { tryNative, available } from "@/lib/kiosk-device";

/**
 * Locking the tablet to the app.
 *
 * Three things have to be true before this is safe to switch on, and they are
 * the reason it is a module rather than two lines at startup:
 *
 *  1. The app must be device owner. Without it `startLockTask` degrades to
 *     screen pinning, which shows a system dialog and can be dismissed — fine,
 *     but it must be reported as what it is rather than as a locked device.
 *  2. The tablet must have an escape PIN. Locking a device with no way out
 *     means the next Wi-Fi change costs a factory reset per tablet.
 *  3. It must be reversible from the device itself, by someone standing in
 *     front of it with no network.
 */

export type LockState = {
  /** "locked" is real lock task; "pinned" is the unprivileged fallback. */
  mode: "locked" | "pinned" | "off";
  isDeviceOwner: boolean;
};

/**
 * Turn the tablet into a till.
 *
 * Refuses without an escape PIN, deliberately. The tablet has one from
 * enrollment and is sent the current one on every check-in, so the only way to
 * reach this branch is a device that has never successfully talked to the
 * server — exactly the device you must not lock.
 */
export async function lockDown(escapePin: string | null): Promise<LockState> {
  const status = await tryNative((p) => p.getStatus());
  const isDeviceOwner = Boolean(status?.isDeviceOwner);

  if (!escapePin) {
    console.warn("[lockdown] no escape PIN on this device — not locking");
    return { mode: "off", isDeviceOwner };
  }

  if (!available()) return { mode: "off", isDeviceOwner: false };

  // Policy first, then lock task: setLockTaskPackages has to have named this
  // package before startLockTask will enter the real thing rather than pinning.
  await tryNative((p) => p.setKioskPolicy({ enable: true }));
  const result = await tryNative((p) => p.startLockTask());

  return {
    mode: result?.mode === "lock_task" ? "locked" : result?.ok ? "pinned" : "off",
    isDeviceOwner,
  };
}

/**
 * Let someone out, if they know this tablet's PIN.
 *
 * Checked natively against the copy in SharedPreferences — the reason to unlock
 * a tablet is usually that it cannot reach the network, so a check that needs
 * the network would fail exactly when it is needed.
 */
export async function unlock(pin: string): Promise<{ ok: boolean; reason?: string }> {
  if (!available()) return { ok: false, reason: "not available on this build" };
  const result = await tryNative((p) => p.stopLockTask({ pin }));
  if (!result) return { ok: false, reason: "unavailable" };
  if (result.ok) await tryNative((p) => p.setKioskPolicy({ enable: false }));
  return { ok: result.ok, reason: result.reason };
}

/** Hand the tablet back: release ownership and every restriction with it. */
export async function releaseDevice(pin: string): Promise<{ ok: boolean; reason?: string }> {
  const result = await tryNative((p) => p.unenroll({ pin }));
  return result ? { ok: result.ok, reason: result.reason } : { ok: false, reason: "unavailable" };
}
