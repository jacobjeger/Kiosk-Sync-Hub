import { nanoid } from "nanoid";
import { tryNative, available } from "@/lib/kiosk-device";

/**
 * Who this tablet is.
 *
 * There used to be no identity beyond a nanoid in localStorage, read only by
 * the error reporter — so a crash could be traced to a device and a sale could
 * not, and clearing app data made the tablet a stranger again.
 *
 * The credential now lives in native SharedPreferences, which survives a
 * WebView data clear and a bundle swap. localStorage is the fallback for a
 * build without the native half, and it is genuinely weaker: it is the same
 * store the offline queue uses and is cleared by the same actions.
 */

const LEGACY_KEY = "pdca_kiosk_device_id";
const FALLBACK_ID = "pdca_device_id";
const FALLBACK_SECRET = "pdca_device_secret";
const FALLBACK_PIN = "pdca_escape_pin";

export type Identity = {
  deviceId: string | null;
  deviceSecret: string | null;
  escapePin: string | null;
};

function local(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage full or blocked. Nothing useful to do; the next enrollment fixes it.
  }
}

export async function getIdentity(): Promise<Identity> {
  const native = await tryNative((p) => p.getIdentity());
  if (native?.deviceId && native.deviceSecret) {
    return {
      deviceId: native.deviceId,
      deviceSecret: native.deviceSecret,
      escapePin: native.escapePin,
    };
  }
  return {
    deviceId: local(FALLBACK_ID),
    deviceSecret: local(FALLBACK_SECRET),
    escapePin: local(FALLBACK_PIN),
  };
}

export async function saveIdentity(id: Identity): Promise<void> {
  if (!id.deviceId || !id.deviceSecret) return;

  const saved = await tryNative((p) =>
    p.saveIdentity({
      deviceId: id.deviceId!,
      deviceSecret: id.deviceSecret!,
      escapePin: id.escapePin ?? undefined,
    })
  );

  // Written to localStorage too, always. On a native build it is redundant; on
  // the old APK it is the only copy, and one code path is easier to reason
  // about than two.
  setLocal(FALLBACK_ID, id.deviceId);
  setLocal(FALLBACK_SECRET, id.deviceSecret);
  if (id.escapePin) setLocal(FALLBACK_PIN, id.escapePin);

  if (!saved && available()) {
    console.warn("[device] native identity write failed — falling back to localStorage");
  }
}

/** Keep the escape PIN current without disturbing the credential. */
export async function updateEscapePin(pin: string): Promise<void> {
  if (!pin) return;
  await tryNative((p) => p.setEscapePin({ escapePin: pin }));
  setLocal(FALLBACK_PIN, pin);
}

export async function clearIdentity(): Promise<void> {
  await tryNative((p) => p.clearIdentity());
  for (const key of [FALLBACK_ID, FALLBACK_SECRET, FALLBACK_PIN]) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing to do.
    }
  }
}

/**
 * Hardware fingerprints to send at enrollment.
 *
 * Not an identity — ANDROID_ID changes on a factory reset, which is exactly the
 * operation re-enrollment exists for. It is how the portal notices a *second*
 * row being created for hardware it has already seen, which is the case that
 * would otherwise split one tablet's history in two.
 *
 * The legacy nanoid rides along once so historical crash reports can be matched
 * to the device that produced them.
 */
export async function hardwareIds(): Promise<string[]> {
  const native = await tryNative((p) => p.getIdentity());
  const ids = [native?.androidId, local(LEGACY_KEY)];
  return ids.filter((v): v is string => Boolean(v));
}

/** A stable id for crash reports before the tablet has enrolled. */
export function reportingId(): string {
  let id = local(LEGACY_KEY);
  if (!id) {
    id = nanoid();
    setLocal(LEGACY_KEY, id);
  }
  return id;
}
