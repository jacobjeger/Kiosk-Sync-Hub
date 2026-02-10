import { useEffect, useState } from "react";
import type { Member } from "@/lib/types";
import { Check } from "lucide-react";

interface SuccessScreenProps {
  member: Member;
  businessName: string;
  amount: number;
  onNewTransaction: () => void;
}

export function SuccessScreen({
  member,
  businessName,
  amount,
  onNewTransaction,
}: SuccessScreenProps) {
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (countdown <= 0) {
      onNewTransaction();
      return;
    }

    const timer = setTimeout(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown, onNewTransaction]);

  return (
    <div
      className="min-h-full flex flex-col items-center justify-center py-12 cursor-pointer"
      onClick={onNewTransaction}
      data-testid="success-screen"
    >
      <div className="text-center max-w-[280px] w-full">
        <div className="relative mb-6">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
            <div className="w-14 h-14 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-200">
              <Check className="w-7 h-7 text-white" strokeWidth={3} />
            </div>
          </div>
        </div>

        <h2 className="text-xl font-semibold text-stone-900 mb-1" data-testid="text-success-title">
          Payment Complete
        </h2>
        <p className="text-stone-500 text-sm mb-6">
          Thank you, {member.first_name}!
        </p>

        <div className="bg-white border border-stone-200 rounded-xl p-4 mb-6 shadow-sm">
          <div className="flex justify-between items-center mb-3 pb-3 border-b border-stone-100 flex-wrap gap-1">
            <span className="text-xs text-stone-500 uppercase tracking-wide">
              Amount
            </span>
            <span className="text-xl font-bold text-stone-900 tabular-nums" data-testid="text-success-amount">
              {"\u20AA"}
              {amount.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between items-center flex-wrap gap-1">
            <span className="text-xs text-stone-500 uppercase tracking-wide">
              Business
            </span>
            <span className="text-sm font-medium text-stone-900" data-testid="text-success-business">
              {businessName}
            </span>
          </div>
        </div>

        <button
          data-testid="button-new-transaction"
          className="w-full h-11 bg-stone-900 text-white rounded-xl text-sm font-semibold hover:bg-stone-800 transition-colors active:scale-[0.98]"
          onClick={(e) => {
            e.stopPropagation();
            onNewTransaction();
          }}
        >
          Start New Transaction
        </button>

        <p className="text-xs text-stone-400 mt-4">
          Returning in {countdown}s or tap anywhere
        </p>
      </div>
    </div>
  );
}
