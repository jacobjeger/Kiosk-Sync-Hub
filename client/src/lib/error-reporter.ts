import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import type { QueuedErrorReport } from "@/lib/db";

// Reads at boot. Mutated by the kiosk session to attach the active member.
let appVersion: string | null = null;
let bundleVersion: string | null = null;
let activeMemberId: string | null = null;
const sessionContext: Record<string, unknown> = {};

const DEVICE_ID_KEY = "pdca_kiosk_device_id";

function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = nanoid();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return "unknown";
  }
}

function platform(): string {
  if (typeof (window as any).Capacitor?.getPlatform === "function") {
    return (window as any).Capacitor.getPlatform();
  }
  return "web";
}

function signatureFor(message: string, stack: string | null): string {
  // First non-empty stack frame, stripped of column/line offsets — enough to
  // group repeated occurrences without making every unique error its own bucket.
  const firstFrame = (stack || "")
    .split("\n")
    .map((s) => s.trim())
    .find((s) => s.length > 0 && s !== `Error: ${message}`);
  const frame = firstFrame ? firstFrame.replace(/:\d+:\d+\)?$/, "") : "no-frame";
  return `${message.slice(0, 200)}|${frame.slice(0, 200)}`;
}

export function setKioskVersion(opts: { app?: string; bundle?: string }) {
  if (opts.app) appVersion = opts.app;
  if (opts.bundle) bundleVersion = opts.bundle;
}

export function setActiveMember(memberId: string | null) {
  activeMemberId = memberId;
}

export function setSessionContext(patch: Record<string, unknown>) {
  for (const k of Object.keys(patch)) sessionContext[k] = patch[k];
}

export async function reportError(
  errorType: "js" | "promise" | "react" | "native",
  message: string,
  stack: string | null,
  details: {
    source?: string | null;
    line?: number | null;
    column?: number | null;
    extra?: Record<string, unknown>;
  } = {}
) {
  try {
    const report: QueuedErrorReport = {
      id: nanoid(),
      error_type: errorType,
      message: (message || "Unknown error").slice(0, 2000),
      stack: stack ? stack.slice(0, 10000) : null,
      source: details.source ?? null,
      line_number: details.line ?? null,
      column_number: details.column ?? null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      member_id: activeMemberId,
      context: { ...sessionContext, ...(details.extra || {}) },
      signature: signatureFor(message, stack),
      app_version: appVersion,
      bundle_version: bundleVersion,
      device_id: getDeviceId(),
      platform: platform(),
      status: "pending",
      createdAt: new Date(),
      retryCount: 0,
    };
    await db.errorReports.add(report);
    void flushErrorReports();
  } catch (err) {
    // Never let the reporter itself crash the app.
    console.warn("[reporter] failed to queue report:", err);
  }
}

let flushing = false;
export async function flushErrorReports() {
  if (flushing) return;
  flushing = true;
  try {
    const pending = await db.errorReports
      .where("status")
      .equals("pending")
      .limit(20)
      .toArray();
    for (const r of pending) {
      if (r.retryCount >= 5) {
        await db.errorReports.update(r.id, { status: "failed" });
        continue;
      }
      try {
        const { error } = await supabase.from("kiosk_errors").insert({
          device_id: r.device_id,
          app_version: r.app_version,
          bundle_version: r.bundle_version,
          platform: r.platform,
          error_type: r.error_type,
          message: r.message,
          stack: r.stack,
          source: r.source,
          line_number: r.line_number,
          column_number: r.column_number,
          user_agent: r.user_agent,
          member_id: r.member_id,
          context: r.context,
          signature: r.signature,
        });
        if (error) {
          await db.errorReports.update(r.id, {
            retryCount: r.retryCount + 1,
            status: r.retryCount + 1 >= 5 ? "failed" : "pending",
          });
        } else {
          await db.errorReports.update(r.id, { status: "sent", syncedAt: new Date() });
        }
      } catch (err) {
        console.warn("[reporter] flush network error:", err);
        await db.errorReports.update(r.id, { retryCount: r.retryCount + 1 });
        break;
      }
    }
  } catch (err) {
    console.warn("[reporter] flush failed:", err);
  } finally {
    flushing = false;
  }
}

export function installGlobalErrorReporter() {
  if (typeof window === "undefined") return;

  window.addEventListener("error", (e) => {
    const err = e.error as Error | undefined;
    void reportError("js", e.message || err?.message || "window.onerror", err?.stack || null, {
      source: e.filename,
      line: e.lineno,
      column: e.colno,
    });
  });

  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : "Unhandled promise rejection";
    const stack = reason instanceof Error ? reason.stack ?? null : null;
    void reportError("promise", message, stack);
  });

  // Try flushing periodically and on visibility changes — same hook points
  // as the offline transaction queue.
  setInterval(() => void flushErrorReports(), 30_000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void flushErrorReports();
  });
  window.addEventListener("online", () => void flushErrorReports());
}
