import { checkin } from "@/lib/api";
import { telemetry } from "@/lib/telemetry";
import { setConfig } from "@/lib/config";
import { markBundleHealthy } from "@/lib/ota-update";
import { tryNative, available } from "@/lib/kiosk-device";
import { setBundleVersion } from "@/lib/version";

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
let onCheckUpdate: (() => void) | null = null;

/** The OTA check is owned elsewhere; this is how a command reaches it. */
export function setUpdateChecker(fn: () => void) {
  onCheckUpdate = fn;
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
        const out = enable
          ? await tryNative((p) => p.startLockTask())
          : await tryNative((p) => p.stopLockTask({ pin: String(command.payload?.pin ?? "") }));
        return out?.ok
          ? { command_id: command.id, status: "done", result: out }
          : {
              command_id: command.id,
              status: "failed",
              error: out?.reason ?? "not available on this build",
            };
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

  const response = await checkin({ telemetry: await telemetry(), results });

  if (!response.ok) {
    pendingResults = results.concat(pendingResults);
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

  for (const command of response.data.commands ?? []) {
    pendingResults.push(await execute(command as Command));
  }
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

  return () => {
    if (timer) clearTimeout(timer);
    window.removeEventListener("online", onOnline);
  };
}
