import Dexie, { type Table } from "dexie";
import type { Member, Business, OfflineTransaction } from "./types";

export interface FavoritesCache {
  memberId: string;
  businessIds: string[];
  timestamp: number;
}

export class KioskDatabase extends Dexie {
  members!: Table<Member>;
  businesses!: Table<Business>;
  offlineTransactions!: Table<OfflineTransaction>;
  favoritesCache!: Table<FavoritesCache>;

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
  }
}

export const db = new KioskDatabase();
