import { pgTable, text, timestamp, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// We define the schema here for type sharing, even though we use Dexie (Local) and Supabase (Remote)
// This roughly matches what we expect in Supabase and IndexedDB

export const transactions = pgTable("transactions", {
  id: text("id").primaryKey(), // UUID
  amount: numeric("amount").notNull(),
  description: text("description"),
  status: text("status").notNull().default('pending'), // 'pending' | 'synced'
  syncedAt: timestamp("synced_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({ 
  createdAt: true,
  syncedAt: true 
});

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
