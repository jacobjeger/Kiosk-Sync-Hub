import { supabase } from "@/lib/supabase";
import { db } from "@/lib/db";

// Ported from app/actions/kiosk.ts in the v0-payment-system-kiosk repo.
// Server actions there use the admin client; here we go through the anon client.
// RLS must allow these specific writes (members.update where id = self,
// member_questions inserts where member_id = self, etc.).

export async function updateMemberPin(memberId: string, newPin: string) {
  if (!/^\d{4}$/.test(newPin)) {
    return { success: false as const, error: "PIN must be exactly 4 digits" };
  }

  const { error } = await supabase
    .from("members")
    .update({ pin_code: newPin, pin_confirmed: true })
    .eq("id", memberId);

  if (error) return { success: false as const, error: error.message };

  // Keep the local cache in sync so the kiosk session sees the change without a refetch.
  try {
    const cached = await db.members.get(memberId);
    if (cached) {
      await db.members.put({ ...cached, pin_code: newPin, pin_confirmed: true });
    }
  } catch (err) {
    console.warn("[kiosk-actions] failed to sync local member cache:", err);
  }
  return { success: true as const };
}

export async function confirmMemberPin(memberId: string) {
  const { error } = await supabase
    .from("members")
    .update({ pin_confirmed: true })
    .eq("id", memberId);
  if (error) return { success: false as const, error: error.message };
  try {
    const cached = await db.members.get(memberId);
    if (cached) await db.members.put({ ...cached, pin_confirmed: true });
  } catch (err) {
    console.warn("[kiosk-actions] failed to sync local member cache:", err);
  }
  return { success: true as const };
}

export async function submitQuestion(memberId: string, question: string) {
  if (!memberId || !question.trim()) {
    return { success: false as const, error: "Member ID and question are required" };
  }
  const { data, error } = await supabase
    .from("member_questions")
    .insert({
      member_id: memberId,
      question: question.trim(),
      status: "pending",
    })
    .select()
    .single();
  if (error) return { success: false as const, error: error.message };
  return { success: true as const, question: data };
}

export async function getMemberQuestions(memberId: string) {
  const { data, error } = await supabase
    .from("member_questions")
    .select("*")
    .eq("member_id", memberId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return { success: false as const, error: error.message, questions: [] };
  return { success: true as const, questions: data || [] };
}

export async function getUnreadMessages(memberId: string) {
  const { data, error } = await supabase
    .from("member_questions")
    .select("id, question, answer, answered_at")
    .eq("member_id", memberId)
    .eq("status", "answered")
    .is("read_at", null)
    .order("answered_at", { ascending: true });
  if (error) return { success: false as const, messages: [] as any[] };
  return { success: true as const, messages: data || [] };
}

export async function markMessagesRead(messageIds: string[]) {
  if (messageIds.length === 0) return { success: true as const };
  const { error } = await supabase
    .from("member_questions")
    .update({ read_at: new Date().toISOString() })
    .in("id", messageIds);
  if (error) return { success: false as const, error: error.message };
  return { success: true as const };
}

export async function getSystemSetting<T = unknown>(key: string): Promise<T | null> {
  const { data, error } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error || !data) return null;
  return (data.value as T) ?? null;
}
