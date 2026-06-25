import { useState, useEffect, useCallback, useRef } from "react";
import { db } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import type { OfflineTransaction, OfflineCashPayment } from "@/lib/types";
import { nanoid } from "nanoid";

// Generate an RFC4122 v4 UUID using the Web Crypto API. nanoid produces a 21-char
// id which Postgres' UUID type won't accept for client_payment_id.
function uuidv4(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for ancient WebViews — collision-resistant enough for our scale.
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function useOfflineQueue(onReconnect?: (cb: () => void) => () => void) {
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingCashCount, setPendingCashCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncingRef = useRef(false);
  const syncingCashRef = useRef(false);

  const refreshCount = useCallback(async () => {
    const [txCount, cashCount] = await Promise.all([
      db.offlineTransactions.where("status").equals("pending").count(),
      db.offlineCashPayments.where("status").equals("pending").count(),
    ]);
    setPendingCount(txCount);
    setPendingCashCount(cashCount);
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

  const queueCashPayment = useCallback(
    async (data: {
      memberId: string;
      memberName: string;
      billingCycleId: string;
      billingCycleName: string;
      amount: number;
      collectorMemberId: string | null;
      paymentType?: "cash" | "zelle";
      notes?: string | null;
      isFullPayment?: boolean;
    }) => {
      const payment: OfflineCashPayment = {
        id: nanoid(),
        clientPaymentId: uuidv4(),
        memberId: data.memberId,
        memberName: data.memberName,
        billingCycleId: data.billingCycleId,
        billingCycleName: data.billingCycleName,
        amount: data.amount,
        collectorMemberId: data.collectorMemberId,
        paymentType: data.paymentType ?? "cash",
        notes: data.notes ?? null,
        isFullPayment: data.isFullPayment ?? false,
        status: "pending",
        createdAt: new Date(),
        retryCount: 0,
      };
      await db.offlineCashPayments.add(payment);
      // Also write into the local cache so the bill view immediately reflects it.
      await db.cashPaymentsCache.put({
        id: payment.id,
        member_id: payment.memberId,
        billing_cycle_id: payment.billingCycleId,
        amount: payment.amount,
        created_at: payment.createdAt.toISOString(),
      });
      await refreshCount();
      return payment;
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

  const syncCashPayments = useCallback(async () => {
    if (syncingCashRef.current) return;
    syncingCashRef.current = true;
    try {
      const pending = await db.offlineCashPayments
        .where("status")
        .equals("pending")
        .toArray();
      if (pending.length === 0) return;

      for (const payment of pending) {
        if (payment.retryCount >= 10) {
          await db.offlineCashPayments.update(payment.id, { status: "failed" });
          continue;
        }
        try {
          // Single atomic call: SECURITY DEFINER RPC handles both the
          // cash_payments insert and the invoices status flip in one
          // transaction. anon can call it; raw UPDATEs on invoices it can't.
          // Idempotent via client_payment_id — safe to retry.
          const { data, error: rpcError } = await supabase.rpc(
            "record_kiosk_cash_payment",
            {
              p_member_id: payment.memberId,
              p_billing_cycle_id: payment.billingCycleId,
              p_amount: payment.amount,
              p_collector_member_id: payment.collectorMemberId,
              p_payment_type: payment.paymentType,
              p_notes: payment.notes,
              p_is_full_payment: payment.isFullPayment,
              p_client_payment_id: payment.clientPaymentId,
            }
          );

          if (rpcError) {
            console.error("[sync] record_kiosk_cash_payment error:", rpcError);
            // 42883 = function does not exist — RPC migration not yet applied.
            // Surface a clear warning; the row stays pending and we'll retry.
            const code = (rpcError.code || "").toString();
            if (code === "42883" || (rpcError.message || "").includes("record_kiosk_cash_payment")) {
              console.warn(
                "[sync] record_kiosk_cash_payment RPC is missing. Apply scripts/add-record-kiosk-cash-payment-rpc.sql in Supabase. Payment will stay queued."
              );
            }
            await db.offlineCashPayments.update(payment.id, {
              retryCount: payment.retryCount + 1,
              status: payment.retryCount + 1 >= 10 ? "failed" : "pending",
            });
            continue;
          }
          // data shape: { ok, cash_payment_id, invoice_id, total_paid, new_status, already_existed }
          if (data && typeof data === "object" && (data as any).already_existed) {
            console.log("[sync] cash payment already synced previously:", payment.id);
          }

          await db.offlineCashPayments.update(payment.id, {
            status: "synced",
            syncedAt: new Date(),
          });

          // Drop the local mirror so loadBill doesn't double-count this
          // payment (server now has the row; local cache was only meant to
          // tide us over until sync).
          try {
            await db.cashPaymentsCache.delete(payment.id);
          } catch (err) {
            console.warn("[sync] failed to clear cashPaymentsCache row", payment.id, err);
          }
        } catch (err) {
          console.error("[sync] Cash payment network error:", err);
          await db.offlineCashPayments.update(payment.id, {
            retryCount: payment.retryCount + 1,
          });
          break;
        }
      }
    } finally {
      syncingCashRef.current = false;
      await refreshCount();
    }
  }, [refreshCount]);

  useEffect(() => {
    if (onReconnect) {
      return onReconnect(() => {
        console.log("[sync] Reconnected - auto-syncing pending transactions");
        setTimeout(() => {
          syncAll();
          syncCoffeeTallies();
          syncCashPayments();
        }, 2000);
      });
    }

    const handleOnline = () => {
      setTimeout(() => {
        syncAll();
        syncCoffeeTallies();
        syncCashPayments();
      }, 3000);
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [syncAll, syncCoffeeTallies, syncCashPayments, onReconnect]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        console.log("[sync] App became visible - checking for pending");
        setTimeout(() => {
          syncAll();
          syncCoffeeTallies();
          syncCashPayments();
        }, 1000);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [syncAll, syncCoffeeTallies, syncCashPayments]);

  useEffect(() => {
    syncAll();
    syncCoffeeTallies();
    syncCashPayments();
  }, [syncAll, syncCoffeeTallies, syncCashPayments]);

  return {
    pendingCount,
    pendingCashCount,
    isSyncing,
    queueTransaction,
    queueCashPayment,
    syncAll,
    syncCoffeeTallies,
    syncCashPayments,
  };
}
