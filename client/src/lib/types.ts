export interface Business {
  id: string;
  name: string;
  description: string | null;
  category: string;
  is_active: boolean;
  preset_amounts?: number[] | null;
  fee_percentage: number;
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
  status: "active" | "paused" | "deleted";
  pause_reason: string | null;
  kiosk_message: string | null;
  skip_pin: boolean;
  pin_confirmed?: boolean;
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
