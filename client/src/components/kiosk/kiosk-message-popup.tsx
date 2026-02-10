import { MessageSquare } from "lucide-react";
import type { Member } from "@/lib/types";

interface KioskMessagePopupProps {
  member: Member;
  onClose: () => void;
}

export function KioskMessagePopup({ member, onClose }: KioskMessagePopupProps) {
  if (!member.kiosk_message) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" data-testid="kiosk-message-popup">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        <div className="bg-gradient-to-r from-amber-500 to-amber-600 p-5 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">
                Message for {member.first_name}
              </h2>
              <p className="text-amber-100 text-sm">
                Please read before continuing
              </p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 mb-6">
            <p className="text-stone-700 whitespace-pre-wrap">
              {member.kiosk_message}
            </p>
          </div>

          <button
            data-testid="button-dismiss-message"
            className="w-full h-11 bg-stone-900 text-white rounded-xl text-sm font-semibold hover:bg-stone-800 transition-colors active:scale-[0.98]"
            onClick={onClose}
          >
            I Understand - Continue
          </button>
        </div>
      </div>
    </div>
  );
}
