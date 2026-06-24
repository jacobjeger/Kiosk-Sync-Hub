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
  pin_code: string | null;
  card_status?: "active" | "declined" | "pending_review";
  card_last_four: string | null;
  status: "active" | "paused" | "deleted";
  pause_reason: string | null;
  kiosk_message: string | null;
  skip_pin: boolean;
  pin_confirmed?: boolean;
  is_cash_collector: boolean;
  cash_collector_pin: string | null;
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
