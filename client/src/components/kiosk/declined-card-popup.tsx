import { useEffect, useState } from "react";
import { AlertTriangle, CreditCard, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import type { Member } from "@/lib/types";

interface DeclinedCardMessage {
  title: string;
  subtitle: string;
  body: string;
  note: string;
}

interface DeclinedCardPopupProps {
  member: Member;
  onClose: () => void;
  onResolutionSubmitted: () => void;
}

export function DeclinedCardPopup({
  member,
  onClose,
  onResolutionSubmitted,
}: DeclinedCardPopupProps) {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [selectedAction, setSelectedAction] = useState<"retry" | "update" | null>(null);
  const [declineDeadline, setDeclineDeadline] = useState<string | null>(null);
  const [message, setMessage] = useState<DeclinedCardMessage>({
    title: "Card Payment Issue",
    subtitle: "Action required for your account",
    body: "Hi {{name}}, we were unable to process your recent payment. Your card was declined. Please choose how you would like to resolve this:",
    note: "If this issue is not resolved, your account may be restricted from making purchases.",
  });

  useEffect(() => {
    const now = new Date();
    const deadline = new Date(now.getTime() + 72 * 60 * 60 * 1000);
    setDeclineDeadline(deadline.toISOString());

    (async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "declined_card_message")
        .maybeSingle();
      if (data?.value) setMessage(data.value as DeclinedCardMessage);
    })();
  }, []);

  async function handleSubmitResolution(requestType: "retry_charge" | "update_card") {
    setSubmitting(true);
    await supabase.from("pending_card_changes").insert({
      member_id: member.id,
      request_type: requestType,
      status: "pending",
    });
    await supabase
      .from("members")
      .update({ card_status: "pending_review" })
      .eq("id", member.id);
    setSubmitting(false);
    setSubmitted(true);
    setTimeout(() => {
      onResolutionSubmitted();
    }, 2000);
  }

  if (submitted) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-stone-900 mb-2">Request Submitted</h2>
          <p className="text-stone-500">
            Your request has been submitted for review. You can continue using the kiosk.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
        <div className="bg-gradient-to-r from-red-500 to-red-600 p-6 text-white">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold">{message.title}</h2>
              <p className="text-red-100 text-sm">{message.subtitle}</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <p className="text-stone-600 mb-4">
            Hi {member.first_name}, we were unable to process your recent payment. Your card
            was declined. Please contact Yaakov Koegel or call/text Tzachi at 845-573-1405 to
            resolve this.
          </p>

          {declineDeadline && (
            <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-red-800 font-semibold">
                ⚠️ Account will be restricted by{" "}
                {new Date(declineDeadline).toLocaleString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          )}

          <div className="space-y-3 mb-6">
            <button
              onClick={() => setSelectedAction("retry")}
              className={`w-full p-4 rounded-xl border-2 transition-all text-left flex items-center gap-4 ${
                selectedAction === "retry"
                  ? "border-green-500 bg-green-50"
                  : "border-stone-200 hover:border-stone-300"
              }`}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  selectedAction === "retry" ? "bg-green-100" : "bg-stone-100"
                }`}
              >
                <Check
                  className={`w-5 h-5 ${
                    selectedAction === "retry" ? "text-green-600" : "text-stone-500"
                  }`}
                />
              </div>
              <div>
                <p className="font-semibold text-stone-900">
                  The issue was resolved, my card is ready to be charged
                </p>
                <p className="text-sm text-stone-500">Your card will be processed again</p>
              </div>
            </button>

            <button
              onClick={() => setSelectedAction("update")}
              className={`w-full p-4 rounded-xl border-2 transition-all text-left flex items-center gap-4 ${
                selectedAction === "update"
                  ? "border-blue-500 bg-blue-50"
                  : "border-stone-200 hover:border-stone-300"
              }`}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  selectedAction === "update" ? "bg-blue-100" : "bg-stone-100"
                }`}
              >
                <CreditCard
                  className={`w-5 h-5 ${
                    selectedAction === "update" ? "text-blue-600" : "text-stone-500"
                  }`}
                />
              </div>
              <div>
                <p className="font-semibold text-stone-900">
                  I will update the payment method
                </p>
                <p className="text-sm text-stone-500">
                  Visit tcpdca.com to add a new credit card
                </p>
              </div>
            </button>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-amber-800">
              <strong>Note:</strong> {message.note} Visit <strong>tcpdca.com</strong> to
              update your card information online.
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 bg-transparent"
              onClick={onClose}
              disabled={submitting}
            >
              Remind Me Later
            </Button>
            <Button
              className="flex-1"
              disabled={!selectedAction || submitting}
              onClick={() =>
                selectedAction &&
                handleSubmitResolution(
                  selectedAction === "retry" ? "retry_charge" : "update_card"
                )
              }
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Request"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
