"use server";
/**
 * Server Actions de avisos: marcar uno o todos como leídos y eliminar uno.
 * Valida con Zod y vuelve a comprobar la sesión (getClaims). La base de datos (RLS + GRANT) solo deja
 * tocar los avisos del propio usuario y, al actualizar, únicamente `read_at`; por eso un id ajeno no cambia nada.
 * No requiere suscripción: los avisos son del usuario, no una función del comercio.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { notificationIdSchema, type NotificationActionResult } from "@/features/notifications/schemas";

const FAILED: NotificationActionResult = { ok: false, error: "We couldn't update the notification." };

async function userClient() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub ? supabase : null;
}

export async function markRead(id: unknown): Promise<NotificationActionResult> {
  const parsed = notificationIdSchema.safeParse(id);
  const supabase = await userClient();
  if (!parsed.success || !supabase) return FAILED;
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", parsed.data).is("read_at", null);
  if (error) return FAILED;
  revalidatePath("/notifications");
  return { ok: true };
}

export async function markAllRead(): Promise<NotificationActionResult> {
  const supabase = await userClient();
  if (!supabase) return FAILED;
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  if (error) return FAILED;
  revalidatePath("/notifications");
  return { ok: true };
}

export async function deleteNotification(id: unknown): Promise<NotificationActionResult> {
  const parsed = notificationIdSchema.safeParse(id);
  const supabase = await userClient();
  if (!parsed.success || !supabase) return FAILED;
  const { error } = await supabase.from("notifications").delete().eq("id", parsed.data);
  if (error) return FAILED;
  revalidatePath("/notifications");
  return { ok: true };
}
