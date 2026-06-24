import { useState } from "react";
import { Delete } from "lucide-react";
import type { Member } from "@/lib/types";

interface PinChangeProps {
  member: Member;
  onSuccess: (newPin: string) => void;
  onCancel: () => void;
}

type Step = "current" | "enter" | "confirm";

export function PinChange({ member, onSuccess, onCancel }: PinChangeProps) {
  const [currentPin, setCurrentPin] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [step, setStep] = useState<Step>("current");
  const [error, setError] = useState("");

  const handleNumpadPress = (key: string) => {
    const activePin = step === "current" ? currentPin : step === "enter" ? pin : confirmPin;

    if (key === "backspace") {
      if (step === "current") setCurrentPin((p) => p.slice(0, -1));
      else if (step === "enter") setPin((p) => p.slice(0, -1));
      else setConfirmPin((p) => p.slice(0, -1));
      setError("");
      return;
    }

    if (activePin.length >= 4) return;
    const next = activePin + key;

    if (step === "current") {
      setCurrentPin(next);
      if (next.length === 4) {
        if (next === member.pin_code) {
          setTimeout(() => setStep("enter"), 250);
        } else {
          setError("Incorrect PIN");
          setTimeout(() => {
            setCurrentPin("");
            setError("");
          }, 1500);
        }
      }
    } else if (step === "enter") {
      setPin(next);
      if (next.length === 4) setTimeout(() => setStep("confirm"), 250);
    } else {
      setConfirmPin(next);
      if (next.length === 4) {
        if (next === pin) onSuccess(next);
        else {
          setError("PINs don't match");
          setTimeout(() => {
            setPin("");
            setConfirmPin("");
            setStep("enter");
            setError("");
          }, 1500);
        }
      }
    }
  };

  const displayPin = step === "current" ? currentPin : step === "enter" ? pin : confirmPin;

  return (
    <div className="flex flex-col items-center">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-lg mb-3">
            {member.first_name.charAt(0)}
            {member.last_name.charAt(0)}
          </div>
          <h2 className="text-xl font-semibold text-stone-900">
            {member.first_name} {member.last_name}
          </h2>
          <p className="text-stone-500 text-base mt-1">
            {step === "current"
              ? "Enter Current PIN"
              : step === "enter"
                ? "Enter New PIN"
                : "Confirm New PIN"}
          </p>
        </div>

        <div className="flex justify-center gap-4 mb-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`w-16 h-16 rounded-xl border-2 flex items-center justify-center text-2xl font-bold transition-all ${
                displayPin.length > i
                  ? "bg-blue-600 border-blue-600 text-white"
                  : "bg-white border-stone-200"
              }`}
            >
              {displayPin.length > i ? displayPin[i] : ""}
            </div>
          ))}
        </div>

        {error && (
          <p className="text-center text-red-500 text-sm font-medium mb-3">{error}</p>
        )}

        <div className="flex items-center justify-center gap-2 mb-6">
          {(["current", "enter", "confirm"] as Step[]).map((s) => (
            <div
              key={s}
              className={`w-2.5 h-2.5 rounded-full transition-colors ${
                step === s ? "bg-blue-600" : "bg-stone-300"
              }`}
            />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "backspace"].map(
            (key, i) =>
              key === "" ? (
                <div key={`empty-${i}`} />
              ) : (
                <button
                  key={key}
                  className={`h-16 rounded-xl text-2xl font-semibold flex items-center justify-center transition-all active:scale-95 ${
                    key === "backspace"
                      ? "bg-stone-100 text-stone-600 hover:bg-stone-200"
                      : "bg-white border-2 border-stone-200 text-stone-900 hover:bg-stone-50 hover:border-stone-300"
                  }`}
                  onClick={() => handleNumpadPress(key)}
                >
                  {key === "backspace" ? <Delete className="w-6 h-6" /> : key}
                </button>
              )
          )}
        </div>

        <button
          onClick={onCancel}
          className="w-full mt-2 h-12 text-base font-medium text-stone-400 hover:text-stone-600 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
