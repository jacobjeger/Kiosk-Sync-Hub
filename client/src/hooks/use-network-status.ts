import { useState, useEffect, useCallback, useRef } from "react";
import { isServerReachable, onReachabilityChange } from "@/lib/commands";

const CHECK_INTERVAL = 10000;

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const wasOnlineRef = useRef(navigator.onLine);
  const onReconnectCallbacks = useRef<Array<() => void>>([]);

  const checkConnectivity = useCallback(async () => {
    try {
      /* Reads the check-in loop's result rather than making a request of its
         own. This used to fire its own probe every ten seconds; once the probe
         became a real check-in that was six heartbeats a minute against an
         intended one, and two sources of truth for the same question. */
      const connected = isServerReachable();
      setIsOnline((prev) => {
        if (!prev && connected) {
          onReconnectCallbacks.current.forEach((cb) => cb());
        }
        return connected;
      });
      wasOnlineRef.current = connected;
    } catch {
      setIsOnline(false);
      wasOnlineRef.current = false;
    }
  }, []);

  const onReconnect = useCallback((cb: () => void) => {
    onReconnectCallbacks.current.push(cb);
    return () => {
      onReconnectCallbacks.current = onReconnectCallbacks.current.filter(
        (fn) => fn !== cb
      );
    };
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setTimeout(checkConnectivity, 1000);
    };
    const handleOffline = () => {
      setIsOnline(false);
      wasOnlineRef.current = false;
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    checkConnectivity();
    /* Still polled, but it is now a cheap read of a local flag rather than a
       request — kept so a state change is never missed if a listener is added
       after the fact. */
    const interval = setInterval(checkConnectivity, CHECK_INTERVAL);
    const unsubscribe = onReachabilityChange(() => checkConnectivity());

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        setTimeout(checkConnectivity, 500);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
      clearInterval(interval);
      unsubscribe();
    };
  }, [checkConnectivity]);

  return { isOnline, onReconnect, checkConnectivity };
}
