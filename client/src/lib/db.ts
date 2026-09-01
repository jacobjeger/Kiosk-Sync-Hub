import Dexie, { type Table } from "dexie";
import type {
  Member,
  Business,
  OfflineTransaction,
  CoffeeTally,
  OfflineCashPayment,
  CashPaymentCacheEntry,
} from "./types";

export interface FavoritesCache {
  memberId: string;
  businessIds: string[];
  timestamp: number;
}

export interface BillingCycleCacheEntry {
  id: string;
  name: string;
  status: "active" | "closed" | "invoiced";
  start_date: string;
  end_date: string;
  fetched_at: number;
}

export interface QueuedErrorReport {
  id: string;
  error_type: "js" | "promise" | "react" | "native";
  message: string;
  stack: string | null;
  source: string | null;
  line_number: number | null;
  column_number: number | null;
  user_agent: string | null;
  member_id: string | null;
  context: Record<string, unknown> | null;
  signature: string | null;
  app_version: string | null;
  bundle_version: string | null;
  device_id: string | null;
  platform: string | null;
  status: "pending" | "sent" | "failed";
  createdAt: Date;
  syncedAt?: Date;
  retryCount: number;
}

export class KioskDatabase extends Dexie {
  members!: Table<Member>;
  businesses!: Table<Business>;
  offlineTransactions!: Table<OfflineTransaction>;
  favoritesCache!: Table<FavoritesCache>;
  coffeeTallies!: Table<CoffeeTally>;
  offlineCashPayments!: Table<OfflineCashPayment>;
  cashPaymentsCache!: Table<CashPaymentCacheEntry>;
  billingCyclesCache!: Table<BillingCycleCacheEntry>;
  errorReports!: Table<QueuedErrorReport>;

  constructor() {
    super("kiosk_db");
    this.version(2).stores({
      members: "id, member_code, last_name, is_active",
      businesses: "id, name, is_active",
      offlineTransactions: "id, status, createdAt",
    });
    this.version(3).stores({
      members: "id, member_code, last_name, is_active",
      businesses: "id, name, is_active",
      offlineTransactions: "id, status, createdAt",
      favoritesCache: "memberId",
    });
    this.version(4).stores({
      members: "id, member_code, last_name, is_active",
      businesses: "id, name, is_active",
      offlineTransactions: "id, status, createdAt",
      favoritesCache: "memberId",
      coffeeTallies: "id, memberId, createdAt, status",
    });
    this.version(5).stores({
      members: "id, member_code, last_name, is_active",
      businesses: "id, name, is_active",
      offlineTransactions: "id, status, createdAt",
      favoritesCache: "memberId",
      coffeeTallies: "id, memberId, createdAt, status",
      offlineCashPayments: "id, status, createdAt, memberId, billingCycleId",
      cashPaymentsCache: "id, [member_id+billing_cycle_id], member_id, billing_cycle_id, created_at",
      billingCyclesCache: "id, status, fetched_at",
    });
    this.version(6).stores({
      members: "id, member_code, last_name, is_active",
      businesses: "id, name, is_active",
      offlineTransactions: "id, status, createdAt",
      favoritesCache: "memberId",
      coffeeTallies: "id, memberId, createdAt, status",
      offlineCashPayments: "id, status, createdAt, memberId, billingCycleId",
      cashPaymentsCache: "id, [member_id+billing_cycle_id], member_id, billing_cycle_id, created_at",
      billingCyclesCache: "id, status, fetched_at",
      errorReports: "id, status, createdAt, signature",
    });

    /* v7: queued sales carry a client_tx_id, and the cash tables are gone —
       kiosk cash collection was retired server-side and the RPCs it called no
       longer exist. Existing queued rows have no key, so they are stamped on
       upgrade rather than dropped: a sale someone already made must not vanish
       because the schema moved. */
    this.version(7)
      .stores({
        members: "id, member_code, last_name, is_active",
        businesses: "id, name, is_active",
        offlineTransactions: "id, status, createdAt, clientTxId",
        favoritesCache: "memberId",
        coffeeTallies: "id, memberId, createdAt, status",
        errorReports: "id, status, createdAt, signature",
        offlineCashPayments: null,
        cashPaymentsCache: null,
        billingCyclesCache: null,
      })
      .upgrade(async (tx) => {
        await tx
          .table("offlineTransactions")
          .toCollection()
          .modify((row: { clientTxId?: string }) => {
            if (!row.clientTxId) row.clientTxId = crypto.randomUUID();
          });
      });
  }
}

export const db = new KioskDatabase();
