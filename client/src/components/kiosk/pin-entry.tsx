import { useState } from "react";
import { Delete } from "lucide-react";
import type { Member } from "@/lib/types";

interface PinEntryProps {
  member: Member;
  onSuccess: () => void;
  onCancel: () => void;
}

export function PinEntry({ member, onSuccess, onCancel }: PinEntryProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState(0);

  const handleNumpadPress = (key: string) => {
    if (key === "backspace") {
      setPin((prev) => prev.slice(0, -1));
      setError("");
    } else if (pin.length < 4) {
      const newPin = pin + key;
      setPin(newPin);
      setError("");

      if (newPin.length === 4) {
        if (newPin === member.pin_code) {
          onSuccess();
        } else {
          const newAttempts = attempts + 1;
          setAttempts(newAttempts);
          setPin("");

          if (newAttempts >= 3) {
            setError("Too many attempts");
            setTimeout(() => onCancel(), 1500);
          } else {
            setError(`Incorrect PIN. ${3 - newAttempts} left`);
          }
        }
      }
    }
  };

  return (
    <div className="flex flex-col items-center">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto rounded-full bg-stone-900 flex items-center justify-center text-white font-bold text-lg mb-3">
            {member.first_name.charAt(0)}
            {member.last_name.charAt(0)}
          </div>
          <h2 className="text-xl font-semibold text-stone-900">
            {member.first_name} {member.last_name}
          </h2>
          <p className="text-stone-500 text-base mt-1">Enter PIN</p>
        </div>

        <div className="flex justify-center gap-4 mb-6" data-testid="pin-dots">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`w-16 h-16 rounded-xl border-2 flex items-center justify-center text-3xl font-bold transition-all ${
                pin.length > i
                  ? "bg-stone-900 border-stone-900 text-white"
                  : "bg-white border-stone-200"
              }`}
            >
              {pin.length > i ? "\u2022" : ""}
            </div>
          ))}
        </div>

        {error && (
          <p
            className="text-center text-red-500 text-sm font-medium mb-4"
            data-testid="text-pin-error"
          >
            {error}
          </p>
        )}

        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7",
            "8",
            "9",
            "",
            "0",
            "backspace",
          ].map((key, i) =>
            key === "" ? (
              <div key={`empty-${i}`} />
            ) : (
              <button
                key={key}
                data-testid={`button-pin-${key}`}
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
          data-testid="button-pin-cancel"
          onClick={onCancel}
          className="w-full mt-2 h-12 text-base font-medium text-stone-400 hover:text-stone-600 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
