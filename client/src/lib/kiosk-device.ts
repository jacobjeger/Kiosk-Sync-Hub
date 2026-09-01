import { registerPlugin, Capacitor } from "@capacitor/core";

/**
 * The native kiosk plugin, and life without it.
 *
 * The same bundle has to run on a tablet with the new APK, on one still on the
 * old APK, and in a browser during development. `available()` is what lets one
 * bundle serve all three — nothing here throws when the plugin is missing, it
 * reports the capability as absent and the caller degrades.
 */

export type NativeIdentity = {
  deviceId: string | null;
  deviceSecret: string | null;
  escapePin: string | null;
  androidId: string | null;
  model: string | null;
  androidRelease: string | null;
};

export type NativeStatus = {
  isDeviceOwner: boolean;
  inLockTask: boolean;
  model: string | null;
  androidRelease: string | null;
  batteryPct: number;
};

export type NativeResult = { ok: boolean; reason?: string; mode?: string };

export interface KioskDevicePlugin {
  getIdentity(): Promise<NativeIdentity>;
  saveIdentity(o: {
    deviceId: string;
    deviceSecret: string;
    escapePin?: string;
  }): Promise<{ ok: boolean }>;
  setEscapePin(o: { escapePin: string }): Promise<{ ok: boolean }>;
  clearIdentity(): Promise<{ ok: boolean }>;
  getStatus(): Promise<NativeStatus>;
  startLockTask(): Promise<NativeResult>;
  stopLockTask(o: { pin: string }): Promise<NativeResult>;
  setKioskPolicy(o: { enable: boolean }): Promise<NativeResult>;
  reboot(): Promise<NativeResult>;
  markCommandExecuted(o: { commandId: string }): Promise<{ ok: boolean }>;
  wasCommandExecuted(o: { commandId: string }): Promise<{ executed: boolean }>;
  installCaCert(o: { certificate: string }): Promise<NativeResult & { already?: boolean }>;

  /* The device itself. Each degrades to { ok: false, reason } off a provisioned
     tablet rather than throwing, so the caller reports a capability gap instead
     of an error. */
  addWifiNetwork(o: {
    ssid: string;
    password?: string;
    security?: "wpa2" | "open";
  }): Promise<NativeResult & { networkId?: number; ssid?: string }>;
  removeWifiNetwork(o: { ssid: string }): Promise<NativeResult & { removed?: boolean }>;
  setVolume(o: { percent: number }): Promise<NativeResult & { volume?: number }>;
  setBrightness(o: { percent: number }): Promise<NativeResult & { brightness?: number }>;
  setRestrictions(o: {
    blockFactoryReset?: boolean;
    blockSafeBoot?: boolean;
    blockUsbTransfer?: boolean;
    blockAddUser?: boolean;
    blockAppInstall?: boolean;
  }): Promise<NativeResult>;
  setTimeZone(o: { timeZone: string }): Promise<NativeResult & { timeZone?: string }>;

  /** Radio-level facts about the current connection. */
  getLinkInfo(): Promise<{
    ok: boolean;
    connected?: boolean;
    ssid?: string;
    rssi?: number;
    bars?: number;
    linkSpeedMbps?: number;
    frequencyMhz?: number;
    band?: string;
    rxLinkSpeedMbps?: number;
    txLinkSpeedMbps?: number;
  }>;

  /** The FCM token, once one has been issued. Null before that. */
  getPushToken(): Promise<{ ok: boolean; token: string | null }>;

  /** Fired when a push says there is something waiting. */
  addListener(event: "wake", fn: () => void): Promise<{ remove: () => Promise<void> }>;
  installBundledCa(): Promise<NativeResult & { already?: boolean }>;
  unenroll(o: { pin: string }): Promise<NativeResult>;
}

export const KioskDevice = registerPlugin<KioskDevicePlugin>("KioskDevice");

/** True only on a build that actually carries the native half. */
export function available(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("KioskDevice");
  } catch {
    return false;
  }
}

/**
 * Call a native method, or get null.
 *
 * Every consumer wants "do this if you can", never "crash if you cannot", so
 * the absence is folded in here rather than repeated at each call site.
 */
export async function tryNative<T>(fn: (p: KioskDevicePlugin) => Promise<T>): Promise<T | null> {
  if (!available()) return null;
  try {
    return await fn(KioskDevice);
  } catch (err) {
    console.warn("[kiosk-device] native call failed:", err);
    return null;
  }
}
