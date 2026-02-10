import { db } from "./db";
import { transactions, type InsertTransaction, type Transaction } from "@shared/schema";

export interface IStorage {
  // We keep this minimal since the primary source of truth is Supabase for history
  // and local Dexie for offline. But we might want to log things here if needed.
  // For now, this is just a placeholder as requested to not mess up the server structure.
  // The client will talk to Supabase directly for history when online.
  // However, if we wanted a server-side component, we could add it here.
  ping(): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async ping(): Promise<boolean> {
    return true;
  }
}

export const storage = new DatabaseStorage();
