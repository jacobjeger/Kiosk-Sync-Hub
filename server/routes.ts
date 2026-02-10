import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import path from "path";
import fs from "fs";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get("/download/pdca-kiosk-debug.apk", (_req, res) => {
    const apkPath = path.resolve("android/app/build/outputs/apk/debug/app-debug.apk");
    if (fs.existsSync(apkPath)) {
      res.setHeader("Content-Type", "application/vnd.android.package-archive");
      res.setHeader("Content-Disposition", "attachment; filename=pdca-kiosk-debug.apk");
      res.setHeader("Content-Length", fs.statSync(apkPath).size);
      fs.createReadStream(apkPath).pipe(res);
    } else {
      res.status(404).send("APK not found");
    }
  });

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
