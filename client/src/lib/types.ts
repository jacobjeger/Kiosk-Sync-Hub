export interface Business {
  id: string;
  name: string;
  description: string | null;
  category: string;
  is_active: boolean;
  preset_amounts?: number[] | null;
  fee_percentage: number;
  icon_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Member {
  id: string;
  member_code: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  balance: number;
  is_active: boolean;
  /* Whether a PIN is set, never the PIN itself.
     The roster stopped shipping pin_code when the kiosk route was closed, but
     this field stayed on the type -- so every reader still compiled while
     reading undefined at runtime, which is how the tablet came to ask nobody
     for a PIN. Removing it is what makes the compiler find the rest. */
  has_pin?: boolean;
  card_status?: "active" | "declined" | "pending_review";
  card_last_four: string | null;
  status: "active" | "paused" | "deleted";
  pause_reason: string | null;
  kiosk_message: string | null;
  skip_pin: boolean;
  pin_confirmed?: boolean;
  is_cash_collector: boolean;
  /* Same reasoning: the till is told there is one, not what it is. */
  has_cash_collector_pin?: boolean;
  created_at: string;
  updated_at: string;
}

export interface CoffeeTally {
  id: string;
  type: "small" | "large";
  count: number;
  status: "pending" | "synced" | "failed";
  createdAt: Date;
  syncedAt?: Date;
}

export interface OfflineTransaction {
  id: string;
  /**
   * The server's idempotency key for this sale, stamped when it is queued.
   *
   * Queued rows are replayed up to ten times. Without a key the server has no
   * way to tell a retry from a second purchase, so a slow network would charge
   * a member repeatedly for one lunch. It has to be assigned at enqueue and
   * never regenerated — a fresh key on each attempt is the same bug.
   */
  clientTxId: string;
  memberId: string;
  memberName: string;
  businessId: string;
  businessName: string;
  amount: number;
  description: string;
  comment?: string;
  source: string;
  deviceInfo: Record<string, unknown>;
  status: "pending" | "synced" | "failed";
  createdAt: Date;
  syncedAt?: Date;
  retryCount: number;
}

export interface OfflineCashPayment {
  id: string;
  clientPaymentId: string;
  memberId: string;
  memberName: string;
  billingCycleId: string;
  billingCycleName: string;
  amount: number;
  collectorMemberId: string | null;
  paymentType: "cash" | "zelle";
  notes: string | null;
  isFullPayment: boolean;
  status: "pending" | "synced" | "failed";
  createdAt: Date;
  syncedAt?: Date;
  retryCount: number;
}

export interface CashPaymentCacheEntry {
  id: string;
  member_id: string;
  billing_cycle_id: string;
  amount: number;
  created_at: string;
}
