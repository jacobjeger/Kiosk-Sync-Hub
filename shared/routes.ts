import { z } from "zod";
import { insertTransactionSchema, transactions } from "./schema";

export const api = {
  transactions: {
    list: {
      method: "GET",
      path: "/api/transactions",
      responses: {
        200: z.array(z.custom<typeof transactions.$inferSelect>()),
      },
    },
    sync: {
      method: "POST",
      path: "/api/transactions/sync",
      input: z.array(insertTransactionSchema),
      responses: {
        200: z.object({ synced: z.number() }),
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
