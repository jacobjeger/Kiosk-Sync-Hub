import { useState, useEffect, useCallback, useRef } from "react";
import { db } from "@/lib/db";
import { replay, apiFetch } from "@/lib/api";
import type { OfflineTransaction } from "@/lib/types";
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
  const [isSyncing, setIsSyncing] = useState(false);
  const syncingRef = useRef(false);

  const refreshCount = useCallback(async () => {
    const [txCount] = await Promise.all([
      db.offlineTransactions.where("status").equals("pending").count(),
    ]);
    setPendingCount(txCount);
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
        // Stamped once, here. Regenerating it per attempt would defeat the
        // point — the server would see each retry as a new sale.
        clientTxId: uuidv4(),
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

  /**
   * Replay queued sales.
   *
   * Two changes from what this used to do, both of them bugs rather than
   * preferences.
   *
   * The sales go to Railway now, through the one purchase path — the old RPC
   * added the amount to a member's balance with no service fee and no ledger
   * entries, so a queued lunch was recorded and never billable.
   *
   * And a *rejection* now fails the row immediately instead of being retried.
   * An inactive member or an unavailable business is a decision, not a network
   * problem; retrying it ten times only delays the queue behind something that
   * can never succeed.
   */
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

      // In batches, because the endpoint caps at 100 and a canteen coming back
      // online after an afternoon can have more than that waiting.
      for (let i = 0; i < pending.length; i += 50) {
        const batch = pending.slice(i, i + 50);

        const result = await replay(
          batch.map((tx) => ({
            member_id: tx.memberId,
            business_id: tx.businessId,
            amount: tx.amount,
            description: tx.description || null,
            comment: tx.comment || null,
            source: tx.source || "kiosk",
            device_info: tx.deviceInfo || {},
            client_tx_id: tx.clientTxId,
          }))
        );

        if (!result.ok) {
          if (result.kind === "network") {
            // Stop rather than march through the rest: the network is down and
            // every remaining batch would fail the same way.
            for (const tx of batch) {
              await db.offlineTransactions.update(tx.id, {
                retryCount: tx.retryCount + 1,
                status: tx.retryCount + 1 >= 10 ? "failed" : "pending",
              });
            }
            break;
          }
          // Rejected or revoked: retrying changes nothing.
          console.error("[sync] batch refused:", result.error);
          for (const tx of batch) {
            await db.offlineTransactions.update(tx.id, { status: "failed" });
          }
          continue;
        }

        const byKey = new Map(result.data.results.map((r) => [r.client_tx_id, r]));
        for (const tx of batch) {
          const outcome = byKey.get(tx.clientTxId);

          // "duplicate" means the server already has it — the happiest possible
          // outcome for a replay, and the reason client_tx_id exists.
          if (outcome?.status === "accepted" || outcome?.status === "duplicate") {
            await db.offlineTransactions.update(tx.id, {
              status: "synced",
              syncedAt: new Date(),
            });
          } else if (outcome?.status === "rejected") {
            console.error("[sync] rejected:", tx.clientTxId, outcome.code);
            await db.offlineTransactions.update(tx.id, { status: "failed" });
          } else {
            await db.offlineTransactions.update(tx.id, {
              retryCount: tx.retryCount + 1,
              status: tx.retryCount + 1 >= 10 ? "failed" : "pending",
            });
          }
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
          const result = await apiFetch("/api/kiosk/coffee-tallies", {
            body: {
              type: tally.type,
              count: tally.count,
              created_at: new Date(tally.createdAt).toISOString(),
            },
          });
          if (result.ok) {
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

  /* Kiosk cash collection was retired: record_kiosk_cash_payment no longer
     exists on the server, so everything that called it could only fail. The
     queue, its Dexie tables and the page that fed them are gone with it. */
  useEffect(() => {
    if (onReconnect) {
      return onReconnect(() => {
        console.log("[sync] Reconnected - auto-syncing pending transactions");
        setTimeout(() => {
          syncAll();
          syncCoffeeTallies();
        }, 2000);
      });
    }

    const handleOnline = () => {
      setTimeout(() => {
        syncAll();
        syncCoffeeTallies();
      }, 3000);
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [syncAll, syncCoffeeTallies, onReconnect]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        console.log("[sync] App became visible - checking for pending");
        setTimeout(() => {
          syncAll();
          syncCoffeeTallies();
        }, 1000);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [syncAll, syncCoffeeTallies]);

  useEffect(() => {
    syncAll();
    syncCoffeeTallies();
  }, [syncAll, syncCoffeeTallies]);

  return {
    pendingCount,
    isSyncing,
    queueTransaction,
    syncAll,
    syncCoffeeTallies,
  };
}
