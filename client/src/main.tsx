import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initOtaCheck } from "./lib/ota-update";
import { installGlobalErrorReporter, setKioskVersion } from "./lib/error-reporter";
import { ErrorBoundary } from "./components/ErrorBoundary";

// Build-time app version (from android/app/build.gradle versionName). Bundle
// version is filled in by ota-update.ts once Capacitor confirms which bundle
// is active.
setKioskVersion({ app: "1.8" });

installGlobalErrorReporter();

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

void initOtaCheck();
