"use server";
/**
 * Server Actions para encender y apagar el bot, y marcar que se probó. Solo el dueño.
 * La regla vive en la base de datos: activate_bot() exige suscripción vigente, WhatsApp conectado, al menos un
 * método de pago activo y al menos un producto disponible. Si falta algo, se explica en lenguaje claro.
 * El menú principal básico (pedido, información y asesor) se crea solo, de forma idempotente.
 */
import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import { getOwnerContext } from "@/lib/auth/owner";
import { NOT_FOUND, type ActionResult } from "@/features/settings/schemas";

const REASONS: [pattern: RegExp, message: string][] = [
  [/SUBSCRIPTION_REQUIRED/, "Choose a plan first (Billing). It's needed to turn the bot on."],
  [/WHATSAPP_NOT_CONNECTED/, "Connect your WhatsApp number first."],
  [/PAYMENT_METHOD_REQUIRED/, "Add and activate at least one payment method first."],
  [/CATALOG_REQUIRED/, "Add at least one available product first."],
];

export async function activateBot(): Promise<ActionResult> {
  const owner = await getOwnerContext();
  if (!owner) return NOT_FOUND;
  await owner.supabase.rpc("create_default_menu", { p_tenant: owner.tenantId });
  const { error } = await owner.supabase.rpc("activate_bot", { p_tenant: owner.tenantId });
  if (error) return { ok: false, error: REASONS.find(([pattern]) => pattern.test(error.message))?.[1] ?? "We couldn't turn the bot on. Please try again." };
  revalidatePath("/settings/go-live");
  revalidatePath("/dashboard");
  return { ok: true, message: "Your bot is live" };
}

export async function pauseBot(): Promise<ActionResult> {
  const owner = await getOwnerContext();
  if (!owner) return NOT_FOUND;
  const { error } = await owner.supabase.rpc("pause_bot", { p_tenant: owner.tenantId });
  if (error) return { ok: false, error: "We couldn't pause the bot. Please try again." };
  revalidatePath("/settings/go-live");
  revalidatePath("/dashboard");
  return { ok: true, message: "Your bot is paused" };
}

/** El dueño confirma que probó el bot (paso de la guía) y se asegura el menú básico. */
export async function markBotTested(): Promise<ActionResult> {
  const owner = await getOwnerContext();
  if (!owner) return NOT_FOUND;
  await owner.supabase.rpc("create_default_menu", { p_tenant: owner.tenantId });
  const { error } = await owner.supabase.from("tenant_settings").update({ bot_tested_at: new Date().toISOString() }).eq("tenant_id", owner.tenantId);
  if (error) return { ok: false, error: "We couldn't save that." };
  await logAudit({ actorId: owner.userId, action: "BOT_TESTED_CONFIRMED", resource: "tenant_settings", tenantId: owner.tenantId });
  revalidatePath("/settings/go-live");
  return { ok: true, message: "Marked as tested" };
}
