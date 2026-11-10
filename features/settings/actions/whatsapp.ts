"use server";
/**
 * Server Action para conectar (o rotar el token de) el número de WhatsApp del comercio. Solo el dueño.
 *
 * Flujo: validar con Zod → limitar intentos → comprobar las credenciales EN META (se consulta el número con
 * el token; si Meta las rechaza, no se guarda nada) → guardar el token cifrado en Supabase Vault con la
 * función de la base set_whatsapp_account() (solo service role) y marcar la conexión como `connected`.
 * Seguridad: el token solo existe en memoria durante esta acción; nunca se registra, nunca se devuelve al
 * navegador y los errores de Meta no se muestran tal cual.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { getOwnerContext } from "@/lib/auth/owner";
import { takeAttempt } from "@/lib/auth/rate-limit";
import { getServerEnv } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { toE164 } from "@/lib/whatsapp/payload";
import { NOT_FOUND, type ActionResult } from "@/features/settings/schemas";

const connectSchema = z.object({
  wabaId: z.string().trim().regex(/^\d{5,30}$/, "The WhatsApp Business Account ID has only digits."),
  phoneNumberId: z.string().trim().regex(/^\d{5,30}$/, "The Phone number ID has only digits."),
  token: z.string().trim().min(20, "Paste the full access token.").max(1000).regex(/^\S+$/, "The token can't contain spaces."),
});

export async function connectWhatsApp(input: unknown): Promise<ActionResult> {
  const owner = await getOwnerContext();
  if (!owner) return NOT_FOUND;
  const parsed = connectSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the highlighted fields." };

  const blocked = await takeAttempt(["connectWhatsApp", owner.tenantId]);
  if (blocked) return { ok: false, error: blocked };

  // 1) Meta tiene que aceptar el token para ese número.
  let displayPhone: string | null = null;
  try {
    const response = await fetch(
      `https://graph.facebook.com/${getServerEnv().META_GRAPH_VERSION}/${parsed.data.phoneNumberId}?fields=display_phone_number`,
      { headers: { Authorization: `Bearer ${parsed.data.token}` }, signal: AbortSignal.timeout(10_000) },
    );
    const json = (await response.json().catch(() => null)) as { display_phone_number?: string } | null;
    if (!response.ok) return { ok: false, error: "Meta didn't accept these credentials. Check the Phone number ID and the token." };
    displayPhone = json?.display_phone_number ? toE164(json.display_phone_number) : null;
  } catch {
    return { ok: false, error: "We couldn't reach WhatsApp to check the credentials. Please try again." };
  }

  // 2) Guardar (token cifrado en Vault) y marcar como conectado.
  const admin = createAdminClient();
  const { error } = await admin.rpc("set_whatsapp_account", {
    p_tenant: owner.tenantId,
    p_waba: parsed.data.wabaId,
    p_phone_number_id: parsed.data.phoneNumberId,
    p_display_phone: displayPhone ?? "",
    p_token: parsed.data.token,
  });
  if (error) {
    return { ok: false, error: error.code === "23505" ? "That number is already connected to another business." : "We couldn't save the connection. Please try again." };
  }
  await admin.rpc("set_whatsapp_status", { p_tenant: owner.tenantId, p_status: "connected" });
  await logAudit({ actorId: owner.userId, action: "WHATSAPP_CONNECTED", resource: "tenant_whatsapp_accounts", tenantId: owner.tenantId });
  revalidatePath("/settings/whatsapp");
  return { ok: true, message: "WhatsApp connected" };
}
