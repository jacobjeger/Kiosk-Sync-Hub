import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Member, Business } from "@/lib/types";
import { Delete, MessageSquare, X, AlertTriangle, WifiOff } from "lucide-react";

interface AmountSelectorProps {
  member: Member;
  business: Business;
  onSuccess: (newBalance: number, amount: number) => void;
  onCancel: () => void;
  onOfflineQueue?: (transaction: {
    memberId: string;
    memberName: string;
    businessId: string;
    businessName: string;
    amount: number;
    description: string;
    comment?: string;
    source: string;
    deviceInfo: Record<string, unknown>;
  }) => void;
  isOnline?: boolean;
}

const LOCKOUT_DURATION = 500;

export function AmountSelector({
  member,
  business,
  onSuccess,
  onCancel,
  onOfflineQueue,
  isOnline = true,
}: AmountSelectorProps) {
  const [presetAmounts, setPresetAmounts] = useState<number[]>([
    5, 10, 15, 20, 25, 50,
  ]);
  const [customAmount, setCustomAmount] = useState("");
  const [comment, setComment] = useState("");
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processingAmount, setProcessingAmount] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"preset" | "custom">("preset");

  useEffect(() => {
    async function loadPresetAmounts() {
      if (
        business.preset_amounts &&
        Array.isArray(business.preset_amounts) &&
        business.preset_amounts.length > 0
      ) {
        setPresetAmounts(business.preset_amounts);
        return;
      }
      const { data } = await supabase
        .from("kiosk_settings")
        .select("value")
        .eq("key", "preset_amounts")
        .single();
      if (data?.value && Array.isArray(data.value))
        setPresetAmounts(data.value);
    }
    loadPresetAmounts();
  }, [business.preset_amounts]);

  const processPayment = useCallback(
    async (amount: number) => {
      setProcessing(true);
      setProcessingAmount(amount);
      setError("");

      const expectedBalance = Number(member.balance) - amount;

      await new Promise((resolve) => setTimeout(resolve, LOCKOUT_DURATION));

      const optimisticSuccess = () => {
        setProcessing(false);
        setProcessingAmount(null);
        onSuccess(expectedBalance, amount);
      };

      const deviceInfo = {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
        language: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };

      const transactionData = {
        memberId: member.id,
        memberName: `${member.first_name} ${member.last_name}`,
        businessId: business.id,
        businessName: business.name,
        amount,
        description: `${business.name} - \u20AA${amount.toFixed(2)}`,
        comment: comment.trim() || undefined,
        source: "kiosk",
        deviceInfo,
      };

      if (!isOnline && onOfflineQueue) {
        onOfflineQueue(transactionData);
        optimisticSuccess();
        return;
      }

      try {
        const { data: activeCycle } = await supabase
          .from("billing_cycles")
          .select("id")
          .eq("status", "active")
          .single();

        const { data: result, error: rpcError } = await supabase.rpc(
          "process_kiosk_transaction",
          {
            p_member_id: member.id,
            p_business_id: business.id,
            p_amount: amount,
            p_description: `${business.name} - \u20AA${amount.toFixed(2)}`,
            p_notes: comment.trim() || null,
            p_billing_cycle_id: activeCycle?.id || null,
            p_source: "kiosk",
            p_device_info: deviceInfo,
            p_ip_address: null,
          }
        );

        if (rpcError) {
          if (onOfflineQueue) {
            onOfflineQueue(transactionData);
            optimisticSuccess();
          } else {
            setError("Database error - please try again");
            setProcessing(false);
            setProcessingAmount(null);
            setTimeout(() => setError(""), 3000);
          }
          return;
        }

        if (result && !result.success) {
          setError(result.error || "Transaction failed");
          setProcessing(false);
          setProcessingAmount(null);
          setTimeout(() => setError(""), 3000);
          return;
        }

        setProcessing(false);
        setProcessingAmount(null);
        if (result?.balance_after !== undefined) {
          onSuccess(result.balance_after, amount);
        } else {
          onSuccess(expectedBalance, amount);
        }
      } catch {
        if (onOfflineQueue) {
          onOfflineQueue(transactionData);
          optimisticSuccess();
        } else {
          setError("Network error - please try again");
          setProcessing(false);
          setProcessingAmount(null);
          setTimeout(() => setError(""), 3000);
        }
      }
    },
    [member, business, onSuccess, comment, isOnline, onOfflineQueue]
  );

  const handleNumpadPress = (key: string) => {
    if (key === "clear") setCustomAmount("");
    else if (key === "backspace")
      setCustomAmount((prev) => prev.slice(0, -1));
    else if (key === ".") {
      if (!customAmount.includes("."))
        setCustomAmount((prev) => (prev || "0") + ".");
    } else {
      const parts = customAmount.split(".");
      if (parts[1] && parts[1].length >= 2) return;
      setCustomAmount((prev) => prev + key);
    }
    setError("");
  };

  const parsedAmount = parseFloat(customAmount) || 0;

  return (
    <div className="flex flex-col relative">
      {processing && (
        <div className="absolute inset-0 bg-white/95 z-50 flex items-center justify-center rounded-xl">
          <div className="text-center">
            <div className="w-6 h-6 border-2 border-stone-200 border-t-stone-900 rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs font-medium text-stone-500">
              Processing payment
            </p>
            <p className="text-xl font-bold text-stone-900 tabular-nums">
              {"\u20AA"}
              {processingAmount?.toFixed(2)}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-base font-semibold text-stone-900">
            {business.name}
          </h2>
          <p className="text-stone-500 text-xs">for {member.first_name}</p>
        </div>
        <div className="bg-stone-100 rounded-lg p-1 flex gap-1">
          <button
            data-testid="button-tab-preset"
            onClick={() => setActiveTab("preset")}
            className={`px-4 py-2 rounded-md text-sm font-semibold transition-all ${
              activeTab === "preset"
                ? "bg-white text-stone-900 shadow-sm"
                : "text-stone-500 hover:text-stone-700"
            }`}
          >
            Quick
          </button>
          <button
            data-testid="button-tab-custom"
            onClick={() => setActiveTab("custom")}
            className={`px-4 py-2 rounded-md text-sm font-semibold transition-all ${
              activeTab === "custom"
                ? "bg-white text-stone-900 shadow-sm"
                : "text-stone-500 hover:text-stone-700"
            }`}
          >
            Custom
          </button>
        </div>
      </div>

      {showCommentInput ? (
        <div className="flex items-center gap-1.5 mb-2">
          <input
            data-testid="input-comment"
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add a note..."
            className="flex-1 h-7 text-xs px-2.5 rounded-md border border-stone-200 text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-stone-300"
            autoFocus
          />
          <button
            onClick={() => {
              setShowCommentInput(false);
              setComment("");
            }}
            className="p-1 text-stone-400 hover:text-stone-600 rounded hover:bg-stone-100"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          data-testid="button-add-note"
          onClick={() => setShowCommentInput(true)}
          className="w-full h-7 text-[11px] text-stone-400 hover:text-stone-600 rounded-md flex items-center justify-center gap-1 transition-colors border border-dashed border-stone-200 hover:border-stone-300 mb-2"
        >
          <MessageSquare className="w-3 h-3" />
          Add note
        </button>
      )}

      {error && (
        <div
          className="mb-2 bg-red-50 border border-red-300 rounded-lg px-3 py-2 flex items-center gap-2 animate-pulse"
          data-testid="text-amount-error"
        >
          <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-[11px] font-semibold text-red-700">
              Transaction Failed
            </p>
            <p className="text-[10px] text-red-600">{error}</p>
          </div>
        </div>
      )}

      {!isOnline && (
        <div className="mb-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 flex items-center gap-2">
          <WifiOff className="w-3.5 h-3.5 text-amber-600" />
          <p className="text-[11px] text-amber-700 font-medium">
            Offline - transaction will sync later
          </p>
        </div>
      )}

      {activeTab === "preset" ? (
        <div className="grid grid-cols-3 gap-1.5">
          {presetAmounts.map((amount) => {
            const isProcessing = processingAmount === amount;
            return (
              <button
                key={amount}
                data-testid={`button-amount-${amount}`}
                onClick={() => !processing && processPayment(amount)}
                disabled={processing}
                className={`
                  rounded-lg py-3 flex flex-col items-center justify-center border transition-all active:scale-[0.98]
                  ${
                    isProcessing
                      ? "bg-stone-900 border-stone-900 text-white"
                      : processing
                        ? "bg-stone-50 border-stone-100 opacity-40 cursor-not-allowed"
                        : "bg-white border-stone-200 hover:border-stone-400 hover:shadow-sm active:bg-stone-50"
                  }
                `}
              >
                <span
                  className={`text-base font-bold tabular-nums ${isProcessing ? "text-white" : "text-stone-900"}`}
                >
                  {"\u20AA"}
                  {amount}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <div className="w-full max-w-sm bg-stone-50 border border-stone-200 rounded-2xl px-6 py-4 mb-3 text-center">
            <input
              data-testid="input-custom-amount"
              type="text"
              value={customAmount}
              readOnly
              className="w-full text-center text-4xl font-bold text-stone-900 tabular-nums bg-transparent outline-none"
            />
          </div>

          <div className="grid grid-cols-3 gap-2 w-full max-w-sm mb-3">
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
              ".",
              "0",
              "backspace",
            ].map((key) => (
              <button
                key={key}
                data-testid={`button-numpad-${key}`}
                className={`h-12 rounded-lg text-base font-semibold flex items-center justify-center transition-all active:scale-95 ${
                  key === "backspace"
                    ? "bg-stone-100 text-stone-500 hover:bg-stone-200"
                    : "bg-white border border-stone-200 text-stone-900 hover:bg-stone-50 hover:border-stone-300"
                }`}
                onClick={() => handleNumpadPress(key)}
                disabled={processing}
              >
                {key === "backspace" ? <Delete className="w-5 h-5" /> : key}
              </button>
            ))}
          </div>

          <div className="flex gap-2 w-full max-w-sm mb-3">
            {[5, 10, 20, 50].map((amount) => (
              <button
                key={amount}
                data-testid={`button-quick-${amount}`}
                onClick={() => setCustomAmount(String(amount))}
                disabled={processing}
                className="flex-1 h-9 bg-stone-100 hover:bg-stone-200 rounded-lg text-xs font-semibold text-stone-600 transition-colors disabled:opacity-40"
              >
                {"\u20AA"}
                {amount}
              </button>
            ))}
          </div>

          <div className="flex gap-3 w-full max-w-sm">
            <button
              data-testid="button-clear-amount"
              onClick={() => setCustomAmount("")}
              disabled={processing || !customAmount}
              className="flex-1 h-11 bg-stone-100 hover:bg-stone-200 rounded-lg text-sm font-medium text-stone-700 transition-colors disabled:opacity-40"
            >
              Clear
            </button>
            <button
              data-testid="button-pay-custom"
              onClick={() => parsedAmount > 0 && processPayment(parsedAmount)}
              disabled={processing || parsedAmount <= 0}
              className="flex-[2] h-11 bg-stone-900 hover:bg-stone-800 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-40 disabled:bg-stone-300"
            >
              Pay {"\u20AA"}
              {parsedAmount.toFixed(2)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
