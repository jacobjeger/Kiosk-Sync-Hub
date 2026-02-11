import { useState, useEffect, useCallback, useRef } from "react";
import { db } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import type { OfflineTransaction } from "@/lib/types";
import { nanoid } from "nanoid";

export function useOfflineQueue(onReconnect?: (cb: () => void) => () => void) {
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncingRef = useRef(false);

  const refreshCount = useCallback(async () => {
    const count = await db.offlineTransactions
      .where("status")
      .equals("pending")
      .count();
    setPendingCount(count);
  }, []);

  useEffect(() => {
    refreshCount();
    const interval = setInterval(refreshCount, 5000);
    return () => clearInterval(interval);
  }, [refreshCount]);

  const queueTransaction = useCallback(
    async (data: {
      memberId: string;
      memberName: string;
      businessId: string;
      businessName: string;
      amount: number;
      description: string;
      comment?: string;
      source: string;
      deviceInfo: Record<string, unknown>;
    }) => {
      const tx: OfflineTransaction = {
        id: nanoid(),
        ...data,
        status: "pending",
        createdAt: new Date(),
        retryCount: 0,
      };
      await db.offlineTransactions.add(tx);
      await refreshCount();
      return tx;
    },
    [refreshCount]
  );

  const syncAll = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setIsSyncing(true);

    try {
      const pending = await db.offlineTransactions
        .where("status")
        .equals("pending")
        .toArray();

      if (pending.length === 0) return;

      let activeCycleId: string | null = null;
      try {
        const { data: activeCycle } = await supabase
          .from("billing_cycles")
          .select("id")
          .eq("status", "active")
          .single();
        activeCycleId = activeCycle?.id || null;
      } catch {
        console.warn("[sync] Could not fetch billing cycle, using null");
      }

      for (const tx of pending) {
        if (tx.retryCount >= 10) {
          await db.offlineTransactions.update(tx.id, { status: "failed" });
          continue;
        }

        try {
          const { data: result, error: rpcError } = await supabase.rpc(
            "process_kiosk_transaction",
            {
              p_member_id: tx.memberId,
              p_business_id: tx.businessId,
              p_amount: tx.amount,
              p_description: tx.description || null,
              p_notes: tx.comment || null,
              p_billing_cycle_id: activeCycleId,
              p_source: tx.source || "kiosk",
              p_device_info: tx.deviceInfo || {},
              p_ip_address: null,
            }
          );

          if (rpcError) {
            console.error("[sync] RPC error for tx", tx.id, rpcError);
            await db.offlineTransactions.update(tx.id, {
              retryCount: tx.retryCount + 1,
              status: tx.retryCount + 1 >= 10 ? "failed" : "pending",
            });
            continue;
          }

          if (result && !result.success) {
            console.error("[sync] Transaction rejected:", result.error);
            await db.offlineTransactions.update(tx.id, {
              retryCount: tx.retryCount + 1,
              status: tx.retryCount + 1 >= 10 ? "failed" : "pending",
            });
            continue;
          }

          await db.offlineTransactions.update(tx.id, {
            status: "synced",
            syncedAt: new Date(),
          });
        } catch (err) {
          console.error("[sync] Network error for tx", tx.id, err);
          await db.offlineTransactions.update(tx.id, {
            retryCount: tx.retryCount + 1,
          });
          break;
        }
      }
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
      await refreshCount();
    }
  }, [refreshCount]);

  useEffect(() => {
    if (onReconnect) {
      return onReconnect(() => {
        console.log("[sync] Reconnected - auto-syncing pending transactions");
        setTimeout(() => { syncAll(); syncCoffeeTallies(); }, 2000);
      });
    }

    const handleOnline = () => {
      setTimeout(() => { syncAll(); syncCoffeeTallies(); }, 3000);
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [syncAll, onReconnect]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        console.log("[sync] App became visible - checking for pending transactions");
        setTimeout(() => { syncAll(); syncCoffeeTallies(); }, 1000);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [syncAll]);

  const syncCoffeeTallies = useCallback(async () => {
    try {
      const pending = await db.coffeeTallies
        .where("status")
        .equals("pending")
        .toArray();

      if (pending.length === 0) return;

      for (const tally of pending) {
        try {
          const { error } = await supabase.from("coffee_tallies").insert({
            type: tally.type,
            count: tally.count,
            created_at: new Date(tally.createdAt).toISOString(),
            synced_from_device: true,
          });
          if (!error) {
            await db.coffeeTallies.update(tally.id, { status: "synced", syncedAt: new Date() });
            console.log("[sync] Coffee tally synced:", tally.id);
          }
        } catch (err) {
          console.warn("[sync] Failed to sync coffee tally:", tally.id, err);
          break;
        }
      }
    } catch (err) {
      console.warn("[sync] Error syncing coffee tallies:", err);
    }
  }, []);

  useEffect(() => {
    syncAll();
    syncCoffeeTallies();
  }, [syncAll, syncCoffeeTallies]);

  return { pendingCount, isSyncing, queueTransaction, syncAll, syncCoffeeTallies };
}
