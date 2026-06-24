import { ArrowLeft, AlertCircle } from "lucide-react";
import type { Member } from "@/lib/types";

interface PinConfirmationScreenProps {
  member: Member;
  onConfirm: () => void;
  onChangePin?: () => void;
  onBack?: () => void;
}

export function PinConfirmationScreen({ member, onConfirm, onBack }: PinConfirmationScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 relative">
      {onBack && (
        <button
          onClick={onBack}
          className="absolute top-4 left-4 p-2 hover:bg-stone-100 rounded-lg transition-colors"
          title="Go back"
        >
          <ArrowLeft className="w-6 h-6 text-stone-600" />
        </button>
      )}
      <div className="w-full max-w-sm">
        <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-2xl flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-blue-600" />
        </div>

        <h2 className="text-xl font-bold text-stone-900 text-center mb-2">
          Welcome, {member.first_name}!
        </h2>
        <p className="text-sm text-stone-500 text-center mb-6">
          Important: PIN Codes Now Required
        </p>

        <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-6 mb-6">
          <p className="text-sm text-stone-700 leading-relaxed mb-4">
            <strong>PIN codes are now required</strong> for all transactions. Your PIN is the{" "}
            <strong>last 4 digits of your card on file</strong>.
          </p>
          <p className="text-sm text-stone-700 leading-relaxed">
            If you don't know your card's last 4 digits, please speak to{" "}
            <strong>Yaakov Koegel</strong> or log in to your account at{" "}
            <strong>tcpdca.com</strong> using the login information emailed to you.
          </p>
        </div>

        <button
          onClick={onConfirm}
          className="w-full bg-stone-900 hover:bg-stone-800 text-white py-4 rounded-xl text-base font-semibold transition-colors active:scale-[0.98]"
        >
          Continue
        </button>

        <p className="text-xs text-stone-400 text-center mt-6">
          You will need to enter your PIN for each transaction.
        </p>
      </div>
    </div>
  );
}
