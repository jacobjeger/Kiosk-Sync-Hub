import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";

const CHECK_INTERVAL = 10000;

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const wasOnlineRef = useRef(navigator.onLine);
  const onReconnectCallbacks = useRef<Array<() => void>>([]);

  const checkConnectivity = useCallback(async () => {
    try {
      const { error } = await supabase
        .from("businesses")
        .select("id", { count: "exact", head: true })
        .limit(1);
      const connected = !error;
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
    const interval = setInterval(checkConnectivity, CHECK_INTERVAL);

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
    };
  }, [checkConnectivity]);

  return { isOnline, onReconnect, checkConnectivity };
}
