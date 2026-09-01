import { getIdentity, updateEscapePin } from "@/lib/device";

/**
 * Everything the tablet says to the server.
 *
 * This replaces supabase-js. The tablets used to talk to a Supabase project
 * while the portal talked to Railway — two databases, quietly diverging, with
 * sales landing in the one nothing else read.
 *
 * Three things this does that the old client did not:
 *
 *  - **Times out.** Every supabase-js call here had no deadline, so a network
 *    that accepted a connection and then stalled would hang a purchase forever
 *    with the member standing at the till.
 *  - **Distinguishes "could not ask" from "was told no".** The kiosk queued
 *    both for retry, so a refusal — an inactive member, say — was replayed
 *    every few minutes for as long as the queue lived.
 *  - **Notices being deactivated.** A revoked tablet gets a specific answer and
 *    can say so, rather than looking like it is offline.
 */

/**
 * Where the server is.
 *
 * Defaults to the same origin the OTA manifest already uses, so there is one
 * hostname to get right — and deliberately not the generated *.up.railway.app
 * name, which can change and would take the update channel down with it.
 *
 * Overridable at build time only, for testing against a deployment before DNS
 * moves. Baked into the bundle, so changing it means publishing a new one.
 */
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "https://tcpdca.com";

/** Long enough for a slow canteen network, short enough not to strand a sale. */
const TIMEOUT_MS = 20_000;

export type ApiOk<T> = { ok: true; data: T };
export type ApiError =
  /** We could not reach the server, or it failed. Safe to retry. */
  | { ok: false; kind: "network"; error: string }
  /** The server understood and refused. Retrying will refuse again. */
  | { ok: false; kind: "rejected"; error: string; code?: string; status: number }
  /** This tablet has been deactivated. */
  | { ok: false; kind: "revoked"; error: string };

export type ApiResult<T> = ApiOk<T> | ApiError;

let onRevoked: (() => void) | null = null;

/** Called once when the server says this tablet is no longer trusted. */
export function setRevokedHandler(fn: () => void) {
  onRevoked = fn;
}

export async function apiFetch<T>(
  path: string,
  init: { method?: string; body?: unknown; anonymous?: boolean } = {}
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { "content-type": "application/json" };

  if (!init.anonymous) {
    const id = await getIdentity();
    if (id.deviceId && id.deviceSecret) {
      headers["x-device-id"] = id.deviceId;
      headers["x-device-secret"] = id.deviceSecret;
    }
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: init.method ?? "POST",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    return {
      ok: false,
      kind: "network",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // A non-JSON body from a proxy or an error page. Treated as network rather
    // than rejection: we did not get an answer we can act on.
    if (!response.ok) {
      return { ok: false, kind: "network", error: `HTTP ${response.status}` };
    }
  }

  const body = (payload ?? {}) as Record<string, unknown>;

  if (response.status === 401 && body.code === "device_revoked") {
    onRevoked?.();
    return { ok: false, kind: "revoked", error: String(body.error ?? "Device deactivated") };
  }

  if (!response.ok) {
    /* A 5xx is the server failing, not refusing — retrying is right. A 4xx is a
       decision, and replaying it just wastes the queue. */
    if (response.status >= 500) {
      return { ok: false, kind: "network", error: `HTTP ${response.status}` };
    }
    return {
      ok: false,
      kind: "rejected",
      status: response.status,
      code: typeof body.code === "string" ? body.code : undefined,
      error: String(body.error ?? `HTTP ${response.status}`),
    };
  }

  return { ok: true, data: body as T };
}

/* ---------------------------------------------------------------------------
 * The calls
 * ------------------------------------------------------------------------ */

export type CheckinResponse = {
  server_time: string;
  device: { id: string; label: string };
  update: { version: string; url: string; checksum?: string } | null;
  commands: { id: string; kind: string; payload: Record<string, unknown> }[];
  escape_pin: string | null;
  /** "locked" or "unlocked" — what this tablet should be doing. */
  lock_policy: string;
  settings: Record<string, unknown>;
};

/**
 * Report in and collect instructions.
 *
 * One request carries telemetry up, the results of past commands up, and
 * commands, the update target and config back down — they run on the same
 * schedule, and on a tablet whose connectivity is the thing you are worried
 * about, one request that either works or does not beats three that can
 * half-work.
 */
export async function checkin(body: {
  telemetry?: Record<string, unknown>;
  results?: { command_id: string; status: "done" | "failed"; result?: unknown; error?: string }[];
  events?: { kind: string; detail?: Record<string, unknown> }[];
}): Promise<ApiResult<CheckinResponse>> {
  const result = await apiFetch<CheckinResponse>("/api/kiosk/checkin", { body });

  // A rotated PIN arrives here, so changing it in the portal reaches the tablet
  // without anyone re-enrolling the device.
  if (result.ok && result.data.escape_pin) {
    await updateEscapePin(result.data.escape_pin);
  }
  return result;
}

export async function enroll(body: {
  code: string;
  hardware_ids: string[];
  model?: string | null;
  android_release?: string | null;
  app_version?: string | null;
  version_code?: number | null;
}): Promise<
  ApiResult<{
    device_id: string;
    device_secret: string;
    label: string;
    escape_pin: string;
    warning?: string;
    seen_on?: string;
  }>
> {
  // Anonymous by definition: this is the call that obtains the credential.
  return await apiFetch("/api/kiosk/enroll", { body, anonymous: true });
}

export type PurchaseResponse = {
  success: boolean;
  transaction_id?: string;
  balance_after?: number;
  duplicate?: boolean;
  ils_agorot?: number;
  fee_agorot?: number;
  fee_pct?: number;
  code?: string;
  error?: string;
};

export async function purchase(body: {
  member_id: string;
  business_id: string;
  amount: number;
  description?: string;
  comment?: string;
  client_tx_id: string;
  device_info?: Record<string, unknown>;
}): Promise<ApiResult<PurchaseResponse>> {
  return await apiFetch("/api/kiosk/transaction", { body });
}

/** Replay queued sales. client_tx_id makes a repeated batch a no-op. */
export async function replay(
  transactions: Record<string, unknown>[]
): Promise<ApiResult<{ results: { client_tx_id: string; status: string; code?: string }[] }>> {
  return await apiFetch("/api/transactions/bulk", { body: { transactions } });
}

export async function verifyPin(
  memberId: string,
  pin: string
): Promise<ApiResult<{ valid: boolean; locked?: boolean; status?: string }>> {
  return await apiFetch("/api/kiosk/verify-pin", { body: { member_id: memberId, pin } });
}

export async function reportError(body: Record<string, unknown>): Promise<ApiResult<unknown>> {
  return await apiFetch("/api/kiosk/errors", { body });
}
