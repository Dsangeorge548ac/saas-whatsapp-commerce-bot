"use server";
/**
 * Server Actions de los mensajes del bot (solo el dueño): guardar un texto propio, volver al texto por
 * defecto y marcar los mensajes como revisados (paso de la guía de configuración).
 * Se valida contra los {placeholders} permitidos y obligatorios de cada plantilla (y la base de datos lo
 * vuelve a imponer con un trigger). El texto es plano: nunca se interpreta como HTML ni como código.
 */
import { revalidatePath } from "next/cache";
import { getOwnerContext } from "@/lib/auth/owner";
import { validateMessage } from "@/features/settings/messages";
import { NOT_FOUND, messageBodySchema, messageKeySchema, type ActionResult } from "@/features/settings/schemas";

export async function saveMessage(key: unknown, body: unknown): Promise<ActionResult> {
  const owner = await getOwnerContext();
  const parsedKey = messageKeySchema.safeParse(key);
  const parsedBody = messageBodySchema.safeParse(body);
  if (!owner || !parsedKey.success) return NOT_FOUND;
  if (!parsedBody.success) return { ok: false, error: parsedBody.error.issues[0]?.message ?? "Write the message." };

  // Reglas de la plantilla (la clave tiene que existir y el texto cumplirlas).
  const { data: template } = await owner.supabase
    .from("message_template_defaults")
    .select("allowed_placeholders, required_placeholders, business_type")
    .eq("key", parsedKey.data)
    .order("business_type")
    .limit(1)
    .maybeSingle();
  if (!template) return NOT_FOUND;
  const problem = validateMessage(parsedBody.data, template.allowed_placeholders, template.required_placeholders);
  if (problem) return { ok: false, error: problem };

  const { error } = await owner.supabase
    .from("tenant_messages")
    .upsert({ tenant_id: owner.tenantId, key: parsedKey.data, body: parsedBody.data, is_enabled: true, updated_by: owner.userId }, { onConflict: "tenant_id,key" });
  if (error) return { ok: false, error: "We couldn't save the message. Check the placeholders and try again." };
  revalidatePath("/settings/messages");
  return { ok: true, message: "Message saved" };
}

/** "Reset to default": borra el texto propio y el bot vuelve a usar el sugerido. */
export async function resetMessage(key: unknown): Promise<ActionResult> {
  const owner = await getOwnerContext();
  const parsedKey = messageKeySchema.safeParse(key);
  if (!owner || !parsedKey.success) return NOT_FOUND;
  const { error } = await owner.supabase.from("tenant_messages").delete().eq("tenant_id", owner.tenantId).eq("key", parsedKey.data);
  if (error) return { ok: false, error: "We couldn't reset the message." };
  revalidatePath("/settings/messages");
  return { ok: true, message: "Back to the suggested text" };
}

/** Marca el paso "Bot messages" de la guía como revisado. */
export async function markMessagesReviewed(): Promise<ActionResult> {
  const owner = await getOwnerContext();
  if (!owner) return NOT_FOUND;
  const { error } = await owner.supabase.from("tenant_settings").update({ messages_reviewed_at: new Date().toISOString() }).eq("tenant_id", owner.tenantId);
  if (error) return { ok: false, error: "We couldn't save that." };
  revalidatePath("/settings/messages");
  return { ok: true, message: "Marked as reviewed" };
}
