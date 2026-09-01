import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { db } from "@/lib/db";
import type { Member, Business } from "@/lib/types";

export function useKioskData() {
  const [members, setMembers] = useState<Member[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  const loadFromLocal = useCallback(async () => {
    const localMembers = await db.members.toArray();
    const localBusinesses = await db.businesses.toArray();
    setMembers(localMembers);
    setBusinesses(localBusinesses);
    return { localMembers, localBusinesses };
  }, []);

  /**
   * The roster.
   *
   * One call to Railway, replacing two PostgREST selects against Supabase that
   * carried their own fallback for a column that might not exist. The server
   * decides which members a till may see, and pin_code is no longer among the
   * fields — the tablet gets `has_pin` and asks the server when it needs to
   * check one.
   */
  const fetchRoster = useCallback(async () => {
    const result = await apiFetch<{ members: Member[]; businesses: Business[] }>(
      "/api/kiosk/data",
      { method: "GET" }
    );

    if (!result.ok) {
      console.error("[kiosk] Could not refresh the roster:", result.error);
      setIsError(true);
      return;
    }

    const { members: fetchedMembers, businesses: fetchedBusinesses } = result.data;
    setMembers(fetchedMembers);
    setBusinesses(fetchedBusinesses);
    setIsError(false);

    /* Cached locally so the till keeps working through an outage. Written after
       the fetch succeeds, never before — a half-written cache is worse than a
       stale one, because the stale one is at least internally consistent. */
    await db.members.clear();
    await db.members.bulkPut(fetchedMembers);
    await db.businesses.clear();
    await db.businesses.bulkPut(fetchedBusinesses);
  }, []);

  const refresh = useCallback(async () => {
    await fetchRoster();
  }, [fetchRoster]);

  useEffect(() => {
    async function init() {
      setIsLoading(true);
      try {
        await loadFromLocal();
      } catch (err) {
        console.error("[kiosk] Failed to load local data:", err);
      }
      setIsLoading(false);

      fetchRoster();
    }
    init();

    const interval = setInterval(fetchRoster, 60000);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        console.log("[kiosk] App resumed - refreshing data");
        fetchRoster();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [loadFromLocal, fetchRoster]);

  return { members, businesses, isLoading, isError, refresh };
}
