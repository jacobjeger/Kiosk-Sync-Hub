import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
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

  const fetchFromSupabase = useCallback(async () => {
    try {
      const [membersRes, businessesRes] = await Promise.all([
        supabase
          .from("members")
          .select("id, member_code, first_name, last_name, email, phone, balance, is_active, pin_code, card_status, status, pause_reason, kiosk_message, skip_pin, pin_confirmed, created_at, updated_at")
          .in("status", ["active", "paused"])
          .order("last_name"),
        supabase
          .from("businesses")
          .select("id, name, description, category, is_active, preset_amounts, fee_percentage, icon_url, created_at, updated_at")
          .eq("is_active", true)
          .order("name"),
      ]);

      if (membersRes.error) throw membersRes.error;

      let fetchedBusinesses: Business[];
      if (businessesRes.error) {
        const errMsg = businessesRes.error.message || "";
        const errCode = businessesRes.error.code || "";
        const isColumnMissing =
          errCode === "42703" ||
          errCode === "PGRST204" ||
          errMsg.includes("icon_url") ||
          errMsg.includes("does not exist");
        if (isColumnMissing) {
          console.warn("[kiosk] icon_url column not found, fetching without it. Add icon_url TEXT column to businesses table in Supabase.");
          const fallback = await supabase
            .from("businesses")
            .select("id, name, description, category, is_active, preset_amounts, fee_percentage, created_at, updated_at")
            .eq("is_active", true)
            .order("name");
          if (fallback.error) throw fallback.error;
          fetchedBusinesses = (fallback.data || []) as Business[];
        } else {
          throw businessesRes.error;
        }
      } else {
        fetchedBusinesses = (businessesRes.data || []) as Business[];
      }

      const fetchedMembers = (membersRes.data || []) as Member[];

      setMembers(fetchedMembers);
      setBusinesses(fetchedBusinesses);
      setIsError(false);

      await db.members.clear();
      await db.members.bulkPut(fetchedMembers);
      await db.businesses.clear();
      await db.businesses.bulkPut(fetchedBusinesses);
    } catch (err) {
      console.error("[kiosk] Failed to fetch from Supabase:", err);
      setIsError(true);
    }
  }, []);

  const refresh = useCallback(async () => {
    await fetchFromSupabase();
  }, [fetchFromSupabase]);

  useEffect(() => {
    async function init() {
      setIsLoading(true);
      try {
        await loadFromLocal();
      } catch (err) {
        console.error("[kiosk] Failed to load local data:", err);
      }
      setIsLoading(false);

      fetchFromSupabase();
    }
    init();

    const interval = setInterval(fetchFromSupabase, 60000);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        console.log("[kiosk] App resumed - refreshing data");
        fetchFromSupabase();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [loadFromLocal, fetchFromSupabase]);

  return { members, businesses, isLoading, isError, refresh };
}
