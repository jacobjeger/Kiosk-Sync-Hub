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
    if (localMembers.length > 0) setMembers(localMembers);
    if (localBusinesses.length > 0) setBusinesses(localBusinesses);
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
          .select("id, name, description, category, is_active, preset_amounts, fee_percentage, created_at, updated_at")
          .eq("is_active", true)
          .order("name"),
      ]);

      if (membersRes.error) throw membersRes.error;
      if (businessesRes.error) throw businessesRes.error;

      const fetchedMembers = (membersRes.data || []) as Member[];
      const fetchedBusinesses = (businessesRes.data || []) as Business[];

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
      await loadFromLocal();
      await fetchFromSupabase();
      setIsLoading(false);
    }
    init();

    const interval = setInterval(fetchFromSupabase, 60000);
    return () => clearInterval(interval);
  }, [loadFromLocal, fetchFromSupabase]);

  return { members, businesses, isLoading, isError, refresh };
}
