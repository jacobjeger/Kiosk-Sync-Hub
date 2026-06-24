import { Component, type ReactNode } from "react";
import { reportError } from "@/lib/error-reporter";

interface State {
  hasError: boolean;
  message?: string;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, message: err.message };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    void reportError("react", error.message, error.stack ?? null, {
      extra: { componentStack: info.componentStack ?? null },
    });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center bg-white rounded-2xl border border-stone-200 p-8 shadow-sm">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
            <span className="text-red-600 text-2xl font-bold">!</span>
          </div>
          <h2 className="text-lg font-semibold text-stone-900 mb-2">Something went wrong</h2>
          <p className="text-sm text-stone-500 mb-6">
            The kiosk hit an error and was reset. The issue has been reported automatically.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="bg-stone-900 hover:bg-stone-800 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            Restart Kiosk
          </button>
          {this.state.message && (
            <p className="text-xs text-stone-400 mt-4 break-all">{this.state.message}</p>
          )}
        </div>
      </div>
    );
  }
}
