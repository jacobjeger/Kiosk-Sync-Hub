# PDCA Payment Kiosk

## Overview
A local-first PWA payment kiosk application built with React/Vite, Dexie.js (IndexedDB) for offline storage, and Supabase for cloud sync. Designed for Android tablet kiosk deployment.

## Architecture
- **Frontend**: React + Vite, fullscreen kiosk layout (no sidebar, no routing - single KioskPage with step-based flow)
- **Backend**: Express server (minimal - serves static assets only)
- **Local DB**: Dexie.js (IndexedDB) for members, businesses, and offline transaction queue
- **Cloud DB**: Supabase (READ-ONLY / APPEND-ONLY - only `.insert()` and `.rpc()` allowed, never `.update()`, `.delete()`, or `.upsert()`)
- **Styling**: Tailwind CSS with stone color palette (kiosk-specific, NOT using shadcn theme variables)

## Key Design Decisions
- The kiosk UI uses raw Tailwind classes with stone-* palette (matching the reference v0 design), not shadcn components
- No dark mode - kiosk is always light (stone-50 background)
- No wouter routing - single page with step state machine: member -> pin -> business -> product -> success
- Offline transactions queue to Dexie, synced via Supabase RPC `process_kiosk_transaction`
- Wake Lock API keeps screen awake on tablets
- 45-second idle timeout resets the kiosk session

## Project Structure
```
client/src/
  App.tsx                    - Entry point, renders KioskPage
  index.css                  - Base styles, kiosk-specific resets
  lib/
    types.ts                 - Member, Business, OfflineTransaction types
    db.ts                    - Dexie database (members, businesses, offlineTransactions tables)
    supabase.ts              - Supabase client
    wake-lock.ts             - Screen wake lock utility
    queryClient.ts           - TanStack Query client
  hooks/
    use-kiosk-data.ts        - Fetches members/businesses from Supabase, caches in Dexie
    use-offline-queue.ts     - Manages offline transaction queue and sync
  pages/
    KioskPage.tsx            - Main kiosk flow (step state machine, header, banners)
  components/kiosk/
    member-selector.tsx      - A-Z grouped member list with search
    pin-entry.tsx            - 4-digit PIN numpad
    business-selector.tsx    - Business grid with favorites
    amount-selector.tsx      - Preset + custom amount entry
    success-screen.tsx       - Payment confirmation with auto-redirect
    idle-overlay.tsx         - Inactivity warning overlay
    profile-drawer.tsx       - Member profile with transaction history
    kiosk-message-popup.tsx  - Admin message popup
```

## Environment Variables
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anon (public) key (NOT service role key!)

## Important Notes
- NEVER use `.update()`, `.delete()`, or `.upsert()` on Supabase - append-only
- The Supabase anon key must be the public anon key (starts with `eyJ...`), not the service role key
- Transaction processing uses Supabase RPC `process_kiosk_transaction` function
- Members and businesses are cached locally in Dexie and refreshed every 60 seconds
