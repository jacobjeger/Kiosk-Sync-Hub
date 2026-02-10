import { pgTable, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// This schema reflects the existing Supabase table structure
// Note: We only use this for typing; we do NOT perform migrations (no db:push)
export const transactions = pgTable("transactions", {
  id: text("id").primaryKey(), 
  amount: numeric("amount").notNull(),
  description: text("description"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({ 
  created_at: true 
});

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
