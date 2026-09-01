import { checkin } from "@/lib/api";
import { telemetry } from "@/lib/telemetry";
import { setConfig } from "@/lib/config";
import { markBundleHealthy } from "@/lib/ota-update";
import { tryNative, available } from "@/lib/kiosk-device";
import { setBundleVersion } from "@/lib/version";
import { getIdentity } from "@/lib/device";
import { reconcile } from "@/lib/lockdown";
import { runSpeedTest } from "@/lib/speed-test";

/**
 * Calling home.
 *
 * One request a minute carries telemetry up and brings back commands, the
 * update target and config. The old code polled the update manifest every
 * fifteen minutes and reported nothing at all — a tablet stuck on an old bundle
 * or unable to reach the API was invisible.
 */

const INTERVAL_MS = 60_000;
/** After three failures in a row, stop hammering a network that is clearly down. */
const BACKOFF_MS = 5 * 60_000;
const FAILURES_BEFORE_BACKOFF = 3;

type Command = { id: string; kind: string; payload: Record<string, unknown> };
type Result = { command_id: string; status: "done" | "failed"; result?: unknown; error?: string };

let failures = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

/* Whether the last check-in reached the server.
 *
 * The kiosk needs to know this to decide between charging and queueing, and the
 * check-in is already the request that answers it — so it is published from
 * here rather than probed separately. An independent probe was sending a second
 * full heartbeat every ten seconds, six times the intended traffic, and made
 * the fleet page's idea of "connected" disagree with the tablet's. */
let online = true;
const listeners = new Set<(up: boolean) => void>();

export function isServerReachable(): boolean {
  return online;
}

export function onReachabilityChange(fn: (up: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setOnline(up: boolean) {
  if (up === online) return;
  online = up;
  listeners.forEach((fn) => fn(up));
}
let pendingResults: Result[] = [];
let pendingEvents: { kind: string; detail?: Record<string, unknown> }[] = [];
let onCheckUpdate: (() => void) | null = null;

/**
 * Tell the fleet page something happened here.
 *
 * Rides up on the next check-in rather than being posted when it occurs,
 * because the things worth reporting — a reboot, a bundle swap — are exactly
 * the moments the tablet is least able to make a request.
 */
export function reportEvent(kind: string, detail?: Record<string, unknown>) {
  pendingEvents.push({ kind, detail });
}

/** The OTA check is owned elsewhere; this is how a command reaches it. */
export function setUpdateChecker(fn: () => void) {
  onCheckUpdate = fn;
}


/** Run a native call and turn its result into a command result. */
async function native(
  command: Command,
  fn: (p: import("@/lib/kiosk-device").KioskDevicePlugin) => Promise<{ ok?: boolean; reason?: string }>
): Promise<Result> {
  const out = await tryNative(fn);
  return out?.ok
    ? { command_id: command.id, status: "done", result: out }
    : {
        command_id: command.id,
        status: "failed",
        error: out?.reason ?? "not available on this build",
      };
}

async function execute(command: Command): Promise<Result> {
  /* Asked before acting. A `reboot` interrupts the very report that would say
     it happened, so the tablet keeps its own record of what it has run — and
     writes it before running, because afterwards may not exist. */
  const seen = await tryNative((p) => p.wasCommandExecuted({ commandId: command.id }));
  if (seen?.executed) {
    return { command_id: command.id, status: "done", result: { already: true } };
  }
  await tryNative((p) => p.markCommandExecuted({ commandId: command.id }));

  try {
    switch (command.kind) {
      case "reload":
        // Reported first: the reload throws this context away.
        pendingResults.push({ command_id: command.id, status: "done" });
        await flush();
        window.location.reload();
        return { command_id: command.id, status: "done" };

      case "check_update":
        onCheckUpdate?.();
        return { command_id: command.id, status: "done" };

      case "sync_now":
        window.dispatchEvent(new CustomEvent("pdca:sync-now"));
        return { command_id: command.id, status: "done" };

      case "set_lock_task": {
        const enable = command.payload?.enable !== false;
        /* The PIN comes from the tablet's own store, never the command payload.
           The server already sends it on every check-in, and keeping it out of
           command rows means a queue of instructions is not also a list of
           every tablet's unlock code. */
        const identity = await getIdentity();
        const out = enable
          ? await tryNative((p) => p.startLockTask())
          : await tryNative((p) => p.stopLockTask({ pin: identity.escapePin ?? "" }));
        return out?.ok
          ? { command_id: command.id, status: "done", result: out }
          : {
              command_id: command.id,
              status: "failed",
              error: out?.reason ?? "not available on this build",
            };
      }

      case "install_ca": {
        /* Certificates are pushed rather than only bundled because a CA
           outlives an APK release: it expires, or the filter behind it is
           replaced. Idempotent on the device — installing one already present
           reports `already` and changes nothing. */
        const cert = String(command.payload?.certificate ?? "");
        if (!cert) {
          return { command_id: command.id, status: "failed", error: "no certificate" };
        }
        const out = await tryNative((p) => p.installCaCert({ certificate: cert }));
        return out?.ok
          ? { command_id: command.id, status: "done", result: out }
          : {
              command_id: command.id,
              status: "failed",
              error: out?.reason ?? "not available on this build",
            };
      }

      /* The device controls. All the same shape: ask the native side, report
         what it says. A tablet that is not device owner answers `ok: false`
         with a reason rather than failing, so the portal shows "this tablet
         cannot do that" instead of a command stuck retrying. */
      case "add_wifi": {
        const ssid = String(command.payload?.ssid ?? "");
        if (!ssid) return { command_id: command.id, status: "failed", error: "no ssid" };
        return native(command, (p) =>
          p.addWifiNetwork({
            ssid,
            password: String(command.payload?.password ?? ""),
            security: command.payload?.security === "open" ? "open" : "wpa2",
          })
        );
      }

      case "remove_wifi": {
        const ssid = String(command.payload?.ssid ?? "");
        if (!ssid) return { command_id: command.id, status: "failed", error: "no ssid" };
        return native(command, (p) => p.removeWifiNetwork({ ssid }));
      }

      case "set_volume":
        return native(command, (p) =>
          p.setVolume({ percent: Number(command.payload?.percent ?? 50) })
        );

      case "set_brightness":
        return native(command, (p) =>
          p.setBrightness({ percent: Number(command.payload?.percent ?? 50) })
        );

      case "set_restrictions":
        return native(command, (p) =>
          p.setRestrictions(command.payload as Record<string, boolean>)
        );

      case "set_time_zone": {
        const tz = String(command.payload?.time_zone ?? "");
        if (!tz) return { command_id: command.id, status: "failed", error: "no time zone" };
        return native(command, (p) => p.setTimeZone({ timeZone: tz }));
      }

      case "show_message": {
        /* Handled in the web layer rather than natively: the kiosk already owns
           the whole screen, and a native toast on a locked tablet is smaller
           and shorter-lived than the thing it is trying to say. */
        window.dispatchEvent(
          new CustomEvent("pdca:message", {
            detail: {
              text: String(command.payload?.text ?? ""),
              until: command.payload?.until ?? null,
            },
          })
        );
        return { command_id: command.id, status: "done" };
      }

      case "speed_test": {
        /* Reported as the command's result rather than as telemetry: it is a
           measurement somebody asked for at a moment in time, not a property of
           the tablet, and averaging it into the fleet view would hide exactly
           the spike that prompted the question. */
        const result = await runSpeedTest();
        return result.ok
          ? { command_id: command.id, status: "done", result }
          : { command_id: command.id, status: "failed", error: result.error ?? "test failed", result };
      }

      case "reboot": {
        if (!available()) {
          return { command_id: command.id, status: "failed", error: "not_device_owner" };
        }
        // Reported before the device goes away, so the portal does not have to
        // infer it from the tablet coming back.
        pendingResults.push({ command_id: command.id, status: "done" });
        await flush();
        const out = await tryNative((p) => p.reboot());
        return out?.ok
          ? { command_id: command.id, status: "done" }
          : { command_id: command.id, status: "failed", error: out?.reason ?? "refused" };
      }

      default:
        return { command_id: command.id, status: "failed", error: `unknown command ${command.kind}` };
    }
  } catch (err) {
    return {
      command_id: command.id,
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Push queued events now.
 *
 * Used before a bundle swap, which throws this context away — the report has to
 * be in flight before the thing it reports on happens.
 */
export async function flushEvents(): Promise<void> {
  if (pendingEvents.length === 0) return;
  const events = pendingEvents;
  pendingEvents = [];
  const sent = await checkin({ events });
  if (!sent.ok) pendingEvents = events.concat(pendingEvents);
}

/** Send results now, without waiting for the next scheduled beat. */
async function flush(): Promise<void> {
  if (pendingResults.length === 0) return;
  const results = pendingResults;
  pendingResults = [];
  const sent = await checkin({ results });
  // Put them back if they did not land; the next beat carries them.
  if (!sent.ok) pendingResults = results.concat(pendingResults);
}

export async function beat(): Promise<void> {
  const results = pendingResults;
  pendingResults = [];

  const events = pendingEvents;
  pendingEvents = [];

  const response = await checkin({ telemetry: await telemetry(), results, events });

  if (!response.ok) {
    pendingResults = results.concat(pendingResults);
    pendingEvents = events.concat(pendingEvents);
    failures += 1;
    /* One failure is a blip; the kiosk should not start queueing sales because
       a single request was dropped. Two in a row is a network. */
    if (failures >= 2) setOnline(false);
    return;
  }

  /* The first successful response is what confirms the bundle. Doing it at boot
     would leave Capgo's rollback catching only "fails to start" and never
     "starts fine, cannot reach the server" — which is how a repoint fails. */
  failures = 0;
  setOnline(true);
  void markBundleHealthy();

  if (response.data.settings) setConfig(response.data.settings);
  if (response.data.update?.version) setBundleVersion(response.data.update.version);

  /* Put the tablet where it is supposed to be, every time. This is what makes
     "lock" and "unlock" from the portal work on a device that was offline when
     the button was pressed, and what re-locks a tablet somebody unlocked and
     walked away from. */
  if (response.data.lock_policy) {
    await reconcile(response.data.lock_policy, (await getIdentity()).escapePin);
  }

  for (const command of response.data.commands ?? []) {
    pendingResults.push(await execute(command as Command));
  }

  /* Report straight away rather than on the next beat.
     Results are gathered at the top of this function but commands run at the
     bottom, so anything executed here would otherwise wait a full interval to
     be acknowledged — the portal showed a lock as still queued for up to two
     minutes after the tablet had already locked. `reload` and `reboot` worked
     around it by flushing themselves; this makes it true for every command. */
  if (pendingResults.length > 0) await flush();
}

export function startCheckins(): () => void {
  const tick = async () => {
    try {
      await beat();
    } catch (err) {
      console.warn("[checkin] failed:", err);
      failures += 1;
    }
    const wait = failures >= FAILURES_BEFORE_BACKOFF ? BACKOFF_MS : INTERVAL_MS;
    timer = setTimeout(() => void tick(), wait);
  };

  void tick();

  // Check in immediately when the network returns rather than waiting out the
  // interval — this is the moment an admin is most likely to be watching.
  const onOnline = () => {
    failures = 0;
    void beat();
  };
  window.addEventListener("online", onOnline);

  /* A push saying there is something waiting. The poll stays exactly as it was:
     push is a shortcut, not the transport. Anything that depends on a message
     actually arriving would break on a tablet with no Play Services, no network
     at the moment of sending, or a token the server has not caught up with. */
  let removeWake: (() => Promise<void>) | null = null;
  void tryNative(async (p) => {
    const handle = await p.addListener("wake", () => {
      failures = 0;
      void beat();
    });
    removeWake = handle.remove;
    return { ok: true };
  });

  return () => {
    if (timer) clearTimeout(timer);
    window.removeEventListener("online", onOnline);
    void removeWake?.();
  };
}
