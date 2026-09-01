import { tryNative } from "@/lib/kiosk-device";
import { API_BASE } from "@/lib/api";

/**
 * How good is this tablet's network, actually.
 *
 * Two measurements that answer different questions and are worth having
 * together. The radio numbers say whether the tablet can hear the access point
 * — a till at -80 dBm is a placement problem no bandwidth will fix. The timed
 * download says whether the path to the portal works, which is the thing that
 * actually decides whether a sale goes through, and which a strong signal to a
 * broken router will happily lie about.
 *
 * Sized small on purpose. This runs on a canteen's connection during trading
 * hours, so it measures enough to tell "fine" from "unusable" and stops; a
 * proper saturation test would be a more accurate number and a worse neighbour.
 */

const PAYLOAD_BYTES = 512 * 1024;

export type SpeedTestResult = {
  ok: boolean;
  /** Round trip to the portal, the number that matters most for a sale. */
  latencyMs: number | null;
  downloadKbps: number | null;
  bytes: number | null;
  link: Record<string, unknown> | null;
  error?: string;
};

export async function runSpeedTest(): Promise<SpeedTestResult> {
  const link = (await tryNative((p) => p.getLinkInfo())) ?? null;

  /* Latency first and separately. A single small request measures the round
     trip without the transfer time of the payload folded into it, which is what
     makes the two numbers independently readable. */
  let latencyMs: number | null = null;
  try {
    const started = performance.now();
    const res = await fetch(`${API_BASE}/api/kiosk/ping`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) latencyMs = Math.round(performance.now() - started);
  } catch {
    // Left null; the download below reports the failure with more detail.
  }

  try {
    const started = performance.now();
    const res = await fetch(
      `${API_BASE}/api/kiosk/speedtest?bytes=${PAYLOAD_BYTES}&t=${Date.now()}`,
      { cache: "no-store", signal: AbortSignal.timeout(30_000) }
    );
    if (!res.ok) {
      return { ok: false, latencyMs, downloadKbps: null, bytes: null, link,
               error: `Server answered ${res.status}` };
    }

    // Read to completion — the timing is meaningless until the body is drained.
    const blob = await res.blob();
    const seconds = (performance.now() - started) / 1000;
    const kbps = seconds > 0 ? Math.round((blob.size * 8) / seconds / 1000) : null;

    return { ok: true, latencyMs, downloadKbps: kbps, bytes: blob.size, link };
  } catch (err) {
    return {
      ok: false,
      latencyMs,
      downloadKbps: null,
      bytes: null,
      link,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
