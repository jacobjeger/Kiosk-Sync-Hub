import Dexie, { type Table } from 'dexie';

export interface LocalTransaction {
  id: string; // UUID
  amount: string; // Stored as string to preserve precision
  description: string;
  status: 'pending' | 'synced';
  syncedAt?: Date; // Optional, set when synced
  createdAt: Date;
}

export class KioskDatabase extends Dexie {
  transactions!: Table<LocalTransaction>;

  constructor() {
    super('kiosk_db');
    this.version(1).stores({
      transactions: 'id, status, createdAt' // Indexes
    });
  }
}

export const db = new KioskDatabase();
