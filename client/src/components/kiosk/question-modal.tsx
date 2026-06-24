import { useEffect, useState } from "react";
import { X, Send, CheckCircle2, MessageCircle, Clock } from "lucide-react";
import { submitQuestion, getMemberQuestions } from "@/lib/kiosk-actions";

interface QuestionModalProps {
  memberId: string;
  memberName: string;
  onClose: () => void;
}

interface Question {
  id: string;
  question: string;
  answer: string | null;
  status: "pending" | "answered" | "dismissed";
  created_at: string;
  answered_at: string | null;
}

export function QuestionModal({ memberId, memberName, onClose }: QuestionModalProps) {
  const [tab, setTab] = useState<"ask" | "history">("ask");
  const [question, setQuestion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (tab !== "history") return;
    let cancelled = false;
    setLoadingHistory(true);
    (async () => {
      const result = await getMemberQuestions(memberId);
      if (cancelled) return;
      if (result.success) setQuestions(result.questions as Question[]);
      setLoadingHistory(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, memberId]);

  async function handleSubmit() {
    if (!question.trim()) return;
    setSubmitting(true);
    setError("");
    const result = await submitQuestion(memberId, question);
    if (result.success) {
      setSubmitted(true);
      setTimeout(onClose, 2500);
    } else {
      setError(result.error || "Failed to submit question");
    }
    setSubmitting(false);
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString("he-IL", { month: "short", day: "numeric" });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-stone-100 flex items-center justify-between bg-stone-50 shrink-0">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-blue-600" />
            <h3 className="font-bold text-stone-900">Questions</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-stone-200 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-stone-500" />
          </button>
        </div>

        <div className="flex border-b border-stone-100 shrink-0">
          <button
            onClick={() => setTab("ask")}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${
              tab === "ask"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-stone-400 hover:text-stone-600"
            }`}
          >
            Ask a Question
          </button>
          <button
            onClick={() => setTab("history")}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${
              tab === "history"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-stone-400 hover:text-stone-600"
            }`}
          >
            My Questions
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {tab === "ask" ? (
            submitted ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                </div>
                <h4 className="text-xl font-bold text-stone-900 mb-1">Question Submitted!</h4>
                <p className="text-stone-500 text-sm">We'll get back to you soon.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-stone-500 mb-3">
                    Hi {memberName.split(" ")[0]}, what would you like to ask?
                  </p>
                  <textarea
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Type your question here..."
                    rows={4}
                    className="w-full rounded-xl border border-stone-200 px-4 py-3 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-blue-400 resize-none"
                    autoFocus
                    maxLength={500}
                  />
                  <p className="text-xs text-stone-400 text-right mt-1">
                    {question.length}/500
                  </p>
                </div>

                {error && <p className="text-sm text-red-600">{error}</p>}

                <button
                  onClick={handleSubmit}
                  disabled={!question.trim() || submitting}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  {submitting ? "Submitting..." : "Submit Question"}
                </button>
              </div>
            )
          ) : (
            <div className="space-y-3">
              {loadingHistory ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-stone-200 border-t-stone-900 rounded-full animate-spin" />
                </div>
              ) : questions.length === 0 ? (
                <div className="text-center py-8 text-stone-400">
                  <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No questions yet</p>
                </div>
              ) : (
                questions.map((q) => (
                  <div key={q.id} className="border border-stone-200 rounded-xl p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-stone-900">{q.question}</p>
                      <span className="text-xs text-stone-400 whitespace-nowrap">
                        {formatDate(q.created_at)}
                      </span>
                    </div>
                    {q.status === "answered" && q.answer ? (
                      <div className="bg-blue-50 rounded-lg p-2.5">
                        <p className="text-xs font-semibold text-blue-700 mb-1">Answer:</p>
                        <p className="text-sm text-blue-900">{q.answer}</p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-amber-600">
                        <Clock className="w-3.5 h-3.5" />
                        <p className="text-xs font-medium">Pending response</p>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
