import { useState } from "react";
import { X, MessageCircle, Send, CheckCircle2 } from "lucide-react";
import { submitQuestion } from "@/lib/kiosk-actions";

interface Message {
  id: string;
  question: string;
  answer: string;
  answered_at: string;
}

interface MessagePopupProps {
  memberId: string;
  memberName: string;
  messages: Message[];
  onClose: () => void;
}

export function MessagePopup({ memberId, memberName, messages, onClose }: MessagePopupProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [replyText, setReplyText] = useState("");
  const [showReply, setShowReply] = useState(false);
  const [replySent, setReplySent] = useState(false);
  const [sending, setSending] = useState(false);
  void memberName;

  const current = messages[currentIndex];
  if (!current) return null;

  async function handleReply() {
    if (!replyText.trim()) return;
    setSending(true);
    await submitQuestion(memberId, replyText.trim());
    setSending(false);
    setReplySent(true);
    setReplyText("");
    setTimeout(() => {
      setReplySent(false);
      setShowReply(false);
      if (currentIndex < messages.length - 1) {
        setCurrentIndex((i) => i + 1);
      } else {
        onClose();
      }
    }, 1500);
  }

  function handleNext() {
    if (currentIndex < messages.length - 1) {
      setCurrentIndex((i) => i + 1);
      setShowReply(false);
      setReplyText("");
    } else {
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        <div className="p-4 border-b border-stone-100 flex items-center justify-between bg-blue-50">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-blue-600" />
            <h3 className="font-bold text-stone-900">
              New Message
              {messages.length > 1 ? `s (${currentIndex + 1}/${messages.length})` : ""}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-blue-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-stone-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <p className="text-xs font-medium text-stone-400 mb-1">Your question:</p>
            <p className="text-sm text-stone-600 bg-stone-50 rounded-lg p-3">
              {current.question}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-blue-600 mb-1">Response:</p>
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
              <p className="text-sm text-blue-900">{current.answer}</p>
            </div>
          </div>

          {showReply ? (
            replySent ? (
              <div className="flex items-center gap-2 text-green-600 py-2">
                <CheckCircle2 className="w-5 h-5" />
                <p className="text-sm font-medium">Reply sent!</p>
              </div>
            ) : (
              <div className="space-y-2">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Type your reply..."
                  rows={3}
                  className="w-full rounded-xl border border-stone-200 px-4 py-3 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-blue-400 resize-none"
                  autoFocus
                  maxLength={500}
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleReply}
                    disabled={!replyText.trim() || sending}
                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    {sending ? "Sending..." : "Send Reply"}
                  </button>
                  <button
                    onClick={() => {
                      setShowReply(false);
                      setReplyText("");
                    }}
                    className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 rounded-xl text-sm font-medium text-stone-600 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setShowReply(true)}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                Reply
              </button>
              <button
                onClick={handleNext}
                className="flex-1 py-3 bg-stone-100 hover:bg-stone-200 rounded-xl text-sm font-semibold text-stone-700 transition-colors"
              >
                {currentIndex < messages.length - 1 ? "Next Message" : "Close"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
