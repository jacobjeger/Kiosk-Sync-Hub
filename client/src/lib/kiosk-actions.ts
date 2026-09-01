import { apiFetch, verifyPin } from "@/lib/api";
import { getConfig } from "@/lib/config";

/**
 * What a member can do at the till.
 *
 * Every one of these used to be a direct table write from the tablet against
 * Supabase with the anon key: updating `members`, inserting into
 * `member_questions` and `pending_card_changes` with whatever ids the client
 * chose. They go through one authenticated route now, and the server decides
 * what a device is allowed to change.
 */

type Ok = { success: true };
type Err = { success: false; error: string };

async function member<T = unknown>(
  body: Record<string, unknown>
): Promise<(Ok & { data: T }) | Err> {
  const result = await apiFetch<{ ok: boolean; error?: string } & Record<string, unknown>>(
    "/api/kiosk/member",
    { body }
  );
  if (!result.ok) return { success: false, error: result.error };
  if (!result.data.ok) return { success: false, error: String(result.data.error ?? "Failed") };
  return { success: true, data: result.data as T };
}

/**
 * Set a new PIN.
 *
 * The current PIN goes with it and is checked on the server. The old flow
 * compared it in the browser against a pin_code shipped with the roster, which
 * meant anyone who opened the console could change anyone's PIN.
 */
export async function updateMemberPin(
  memberId: string,
  newPin: string,
  currentPin?: string
): Promise<Ok | Err> {
  if (!/^\d{4}$/.test(newPin)) {
    return { success: false, error: "PIN must be exactly 4 digits" };
  }
  const result = await member({
    action: "set_pin",
    member_id: memberId,
    pin: newPin,
    current_pin: currentPin ?? "",
  });
  return result.success ? { success: true } : result;
}

/** Check a PIN without the PIN ever being compared in the browser. */
export async function checkMemberPin(
  memberId: string,
  pin: string
): Promise<{ valid: boolean; error?: string }> {
  const result = await verifyPin(memberId, pin);
  if (!result.ok) return { valid: false, error: result.error };
  return { valid: Boolean(result.data.valid) };
}

export async function confirmMemberPin(memberId: string): Promise<Ok | Err> {
  const result = await member({ action: "confirm_pin", member_id: memberId });
  return result.success ? { success: true } : result;
}

export async function submitQuestion(memberId: string, question: string): Promise<Ok | Err> {
  if (!memberId || !question.trim()) {
    return { success: false, error: "Member ID and question are required" };
  }
  const result = await member({ action: "ask", member_id: memberId, question });
  return result.success ? { success: true } : result;
}

export async function getMemberQuestions(memberId: string) {
  const result = await member<{ questions: unknown[] }>({
    action: "questions",
    member_id: memberId,
  });
  return result.success
    ? { success: true as const, questions: result.data.questions }
    : { success: false as const, error: result.error, questions: [] };
}

export async function getUnreadMessages(memberId: string) {
  const result = await member<{ messages: unknown[] }>({ action: "unread", member_id: memberId });
  return result.success
    ? { success: true as const, messages: result.data.messages }
    : { success: false as const, error: result.error, messages: [] };
}

export async function markMessagesRead(messageIds: string[]): Promise<Ok | Err> {
  if (messageIds.length === 0) return { success: true };
  const result = await member({ action: "mark_read", message_ids: messageIds });
  return result.success ? { success: true } : result;
}

export async function submitCardResolution(
  memberId: string,
  requestType: "retry_charge" | "update_card"
): Promise<Ok | Err> {
  const result = await member({
    action: "card_resolution",
    member_id: memberId,
    request_type: requestType,
  });
  return result.success ? { success: true } : result;
}

/**
 * A setting the server sent down on the last check-in.
 *
 * Synchronous and offline-safe on purpose: these are read while rendering, and
 * a tablet that cannot reach us should still show the message it was last told
 * to show rather than nothing.
 */
export function getSystemSetting<T = unknown>(key: string): T | null {
  const value = getConfig()[key];
  return (value as T) ?? null;
}

/** This month's purchases for the profile drawer. */
export async function getMemberHistory(memberId: string) {
  const result = await member<{ transactions: unknown[] }>({
    action: "history",
    member_id: memberId,
  });
  return result.success
    ? { success: true as const, transactions: result.data.transactions }
    : { success: false as const, error: result.error, transactions: [] };
}

/** Where this member shops most, for ordering the business list. */
export async function getMemberFavourites(memberId: string) {
  const result = await member<{ businesses: { business_id: string; purchases: number }[] }>({
    action: "favourites",
    member_id: memberId,
  });
  return result.success
    ? { success: true as const, businesses: result.data.businesses }
    : { success: false as const, error: result.error, businesses: [] };
}
