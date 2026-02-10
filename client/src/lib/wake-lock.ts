let wakeLock: WakeLockSentinel | null = null;

export async function requestWakeLock() {
  if (!("wakeLock" in navigator)) {
    return false;
  }

  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => {
      console.log("[kiosk] Wake Lock released");
    });
    return true;
  } catch (err) {
    console.error("[kiosk] Failed to activate Wake Lock:", err);
    return false;
  }
}

export async function releaseWakeLock() {
  if (wakeLock) {
    await wakeLock.release();
    wakeLock = null;
  }
}

export function useWakeLock() {
  if (typeof window !== "undefined") {
    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && wakeLock === null) {
        requestWakeLock();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      releaseWakeLock();
    };
  }
}
