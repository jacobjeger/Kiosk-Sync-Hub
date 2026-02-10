import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Since this is a client-heavy app (PWA with local DB + Supabase),
  // the server mainly serves the static assets.
  // We keep the structure intact as requested.

  // API placeholders if we ever need server-side proxying
  app.get(api.transactions.list.path, async (_req, res) => {
    // In a real scenario, we might proxy to Supabase here if we wanted to hide credentials completely,
    // but the requirement was to use Supabase client on frontend.
    // So we just return empty list or status.
    res.json([]);
  });

  app.post(api.transactions.sync.path, async (_req, res) => {
    res.json({ synced: 0 });
  });

  return httpServer;
}
