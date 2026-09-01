/**
 * Settings the server sends down.
 *
 * Config is state, not an event, so it rides on every check-in rather than
 * being pushed as a command. A tablet that has been offline picks up whatever
 * is current when it comes back, instead of replaying a queue of stale changes
 * in order.
 *
 * Cached in localStorage so a tablet that boots with no network still has the
 * last known values rather than falling back to defaults it was configured away
 * from.
 */

const CACHE_KEY = "pdca_kiosk_config";

export type KioskConfig = {
  preset_amounts?: number[];
  declined_card_message?: string;
  [key: string]: unknown;
};

let current: KioskConfig = {};

try {
  const raw = localStorage.getItem(CACHE_KEY);
  if (raw) current = JSON.parse(raw) as KioskConfig;
} catch {
  // Unreadable cache is the same as no cache.
}

export function setConfig(next: KioskConfig) {
  current = { ...current, ...next };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(current));
  } catch {
    // Nothing to do; the values are still live in memory for this session.
  }
}

export function getConfig(): KioskConfig {
  return current;
}

/** Amounts offered at the till, unless the business has its own. */
export function presetAmounts(fallback: number[] = [5, 10, 15, 20, 25, 50]): number[] {
  const value = current.preset_amounts;
  return Array.isArray(value) && value.length > 0 ? value : fallback;
}
