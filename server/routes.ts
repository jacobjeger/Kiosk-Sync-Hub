import type { Express } from "express";
import { createServer, type Server } from "http";
import { createClient } from "@supabase/supabase-js";
import { storage } from "./storage";
import { api } from "@shared/routes";
import path from "path";
import fs from "fs";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "",
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ""
);

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.post("/api/coffee-tallies/reset", async (req, res) => {
    const { pin } = req.body;
    if (pin !== "181818") {
      return res.status(403).json({ error: "Invalid PIN" });
    }
    try {
      const { error, count } = await supabaseAdmin
        .from("coffee_tallies")
        .delete({ count: "exact" })
        .not("id", "is", null);
      if (error) {
        console.error("[reset] Supabase delete error:", error.message);
        return res.status(500).json({ error: error.message });
      }
      console.log(`[reset] Deleted ${count} coffee tallies from Supabase`);
      res.json({ deleted: count });
    } catch (err: any) {
      console.error("[reset] Server error:", err.message);
      res.status(500).json({ error: "Server error" });
    }
  });

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
