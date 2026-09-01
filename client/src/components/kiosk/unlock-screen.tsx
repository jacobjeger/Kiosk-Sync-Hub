"use client";

import { useState } from "react";
import { Delete, Loader2 } from "lucide-react";
import { unlock } from "@/lib/lockdown";

/**
 * The way out of kiosk mode.
 *
 * Reached by a deliberately obscure gesture rather than a visible button — a
 * button labelled "exit" on a canteen till is an invitation. The PIN is
 * per-tablet and checked on the device, so this works when the tablet cannot
 * reach the server, which is the situation it mostly exists for.
 */
export function UnlockScreen({
  onUnlocked,
  onCancel,
}: {
  onUnlocked: () => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const press = async (key: string) => {
    if (busy) return;
    if (key === "backspace") {
      setPin((p) => p.slice(0, -1));
      setError("");
      return;
    }
    if (pin.length >= 6) return;

    const next = pin + key;
    setPin(next);
    setError("");
    if (next.length < 6) return;

    setBusy(true);
    const result = await unlock(next);
    setBusy(false);

    if (result.ok) {
      onUnlocked();
      return;
    }
    setPin("");
    setError(result.reason === "wrong_pin" ? "Wrong PIN" : (result.reason ?? "Could not unlock"));
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-stone-900/95 p-8">
      <div className="w-full max-w-xs text-center">
        <h2 className="text-lg font-semibold text-white">Unlock this tablet</h2>
        <p className="mt-1 text-sm text-stone-400">
          The PIN is in the admin portal, under Tablets.
        </p>

        <div className="my-6 flex justify-center gap-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className={`h-3 w-3 rounded-full ${pin.length > i ? "bg-white" : "bg-stone-600"}`}
            />
          ))}
        </div>

        {busy && (
          <p className="mb-3 flex items-center justify-center gap-2 text-sm text-stone-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking
          </p>
        )}
        {error && !busy && <p className="mb-3 text-sm font-medium text-red-400">{error}</p>}

        <div className="grid grid-cols-3 gap-2">
          {["1","2","3","4","5","6","7","8","9"].map((k) => (
            <button
              key={k}
              onClick={() => void press(k)}
              className="h-14 rounded-xl bg-stone-800 text-xl font-semibold text-white active:scale-95"
            >
              {k}
            </button>
          ))}
          <button
            onClick={onCancel}
            className="h-14 rounded-xl bg-stone-800 text-sm text-stone-400 active:scale-95"
          >
            Cancel
          </button>
          <button
            onClick={() => void press("0")}
            className="h-14 rounded-xl bg-stone-800 text-xl font-semibold text-white active:scale-95"
          >
            0
          </button>
          <button
            onClick={() => void press("backspace")}
            className="flex h-14 items-center justify-center rounded-xl bg-stone-800 text-stone-400 active:scale-95"
          >
            <Delete className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
