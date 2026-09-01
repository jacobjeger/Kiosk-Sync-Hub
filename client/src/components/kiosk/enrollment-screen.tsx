"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { enroll } from "@/lib/api";
import { saveIdentity, hardwareIds } from "@/lib/device";
import { APP_VERSION } from "@/lib/version";

/**
 * Claiming a tablet.
 *
 * Shown until the device has a credential. An admin creates the tablet in the
 * portal and reads out a code; it is typed here once and traded for a secret
 * the tablet keeps.
 *
 * A code rather than a shared token because a shared token cannot be revoked
 * for one tablet, and cannot say which tablet sent a request — the two things
 * this whole mechanism exists to provide.
 */
export function EnrollmentScreen({ onEnrolled }: { onEnrolled: (label: string) => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");

    const result = await enroll({
      code: code.trim().toUpperCase(),
      hardware_ids: await hardwareIds(),
      app_version: APP_VERSION,
    });

    setBusy(false);

    if (!result.ok) {
      /* "Failed to fetch" is what a browser says for a dead network, a blocked
         request and an untrusted certificate alike, so the message names the
         things a person standing at the tablet can actually check. */
      setError(
        result.kind === "network"
          ? "Could not reach the server. Check Wi-Fi, and that this network does not filter secure connections."
          : result.error
      );
      setCode("");
      return;
    }

    await saveIdentity({
      deviceId: result.data.device_id,
      deviceSecret: result.data.device_secret,
      escapePin: result.data.escape_pin,
    });
    onEnrolled(result.data.label);
  }

  const press = (key: string) => {
    if (busy) return;
    setError("");
    if (key === "backspace") setCode((c) => c.slice(0, -1));
    else if (code.length < 8) setCode((c) => c + key);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-stone-50 p-8">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-semibold text-stone-900">Set up this tablet</h1>
        <p className="mt-2 text-sm text-stone-500">
          Enter the code from the office. It works once and expires after a day.
        </p>

        <div className="my-8 flex justify-center gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className={`flex h-12 w-9 items-center justify-center rounded-lg border-2 text-xl font-bold ${
                code.length > i ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white"
              }`}
            >
              {code[i] ?? ""}
            </div>
          ))}
        </div>

        {busy && (
          <p className="mb-4 flex items-center justify-center gap-2 text-sm text-stone-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Setting up
          </p>
        )}
        {error && !busy && <p className="mb-4 text-sm font-medium text-red-500">{error}</p>}

        <div className="grid grid-cols-3 gap-3">
          {["1","2","3","4","5","6","7","8","9","0"].map((k) => (
            <button
              key={k}
              disabled={busy}
              onClick={() => press(k)}
              className="h-14 rounded-xl border-2 border-stone-200 bg-white text-xl font-semibold text-stone-900 active:scale-95"
            >
              {k}
            </button>
          ))}
          <button
            disabled={busy}
            onClick={() => press("backspace")}
            className="h-14 rounded-xl bg-stone-100 text-sm font-medium text-stone-600 active:scale-95"
          >
            Back
          </button>
          <button
            disabled={busy || code.length < 4}
            onClick={() => void submit()}
            className="h-14 rounded-xl bg-stone-900 text-sm font-semibold text-white disabled:opacity-40 active:scale-95"
          >
            Done
          </button>
        </div>

        {/* Letters appear in codes too, so the keypad alone is not enough. */}
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 8))}
          placeholder="or type it here"
          className="mt-6 w-full rounded-lg border border-stone-200 px-3 py-2 text-center font-mono uppercase tracking-widest"
        />
      </div>
    </div>
  );
}
