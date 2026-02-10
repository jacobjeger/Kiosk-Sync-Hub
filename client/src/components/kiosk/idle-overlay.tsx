interface IdleOverlayProps {
  countdown: number;
  onContinue: () => void;
}

export function IdleOverlay({ countdown, onContinue }: IdleOverlayProps) {
  return (
    <div
      className="fixed inset-0 bg-white/98 backdrop-blur-sm z-50 flex items-center justify-center"
      onClick={onContinue}
      data-testid="idle-overlay"
    >
      <div className="text-center max-w-xs px-6">
        <div className="w-24 h-24 bg-stone-100 border border-stone-200 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
          <span className="text-5xl font-bold text-stone-900 tabular-nums">
            {countdown}
          </span>
        </div>

        <h2 className="text-2xl font-semibold text-stone-900 mb-2">
          Still there?
        </h2>
        <p className="text-sm text-stone-500 mb-6">
          Session will reset in {countdown} seconds
        </p>

        <button
          data-testid="button-continue-session"
          onClick={(e) => {
            e.stopPropagation();
            onContinue();
          }}
          className="w-full h-12 bg-stone-900 text-white font-semibold text-sm rounded-xl hover:bg-stone-800 transition-colors active:scale-[0.98]"
        >
          Continue Session
        </button>
      </div>
    </div>
  );
}
