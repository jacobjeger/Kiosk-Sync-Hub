import Dexie, { type Table } from "dexie";
import type { Member, Business, OfflineTransaction } from "./types";

export class KioskDatabase extends Dexie {
  members!: Table<Member>;
  businesses!: Table<Business>;
  offlineTransactions!: Table<OfflineTransaction>;

  constructor() {
    super("kiosk_db");
    this.version(2).stores({
      members: "id, member_code, last_name, is_active",
      businesses: "id, name, is_active",
      offlineTransactions: "id, status, createdAt",
    });
  }
}

export const db = new KioskDatabase();
