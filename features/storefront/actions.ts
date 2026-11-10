"use server";
/**
 * Server Action de la tienda pública: el cliente envía su pedido desde la página.
 *
 * Patrón: 1) validar con Zod, 2) limitar intentos por IP y por enlace, 3) llamar a la función de la base
 * submit_web_order() con la service role y 4) avisar en el chat de WhatsApp con el resumen del pedido.
 * Seguridad: no hay sesión; la autoridad es el enlace personal de UN solo uso (token ligado a una
 * conversación). Los precios NUNCA vienen del navegador: la base re-precia con el catálogo vigente. Los
 * errores se traducen a mensajes simples, sin detalles internos.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { getClientIp, takeAttempt } from "@/lib/auth/rate-limit";
import { loadSessionContext } from "@/features/whatsapp/context";
import { sendCartSummary } from "@/features/whatsapp/flows/checkout";
import { submitOrderSchema } from "@/features/storefront/schemas";

export type SubmitResult = { ok: true; notified: boolean } | { ok: false; error: string };

const ERRORS: [pattern: RegExp, message: string][] = [
  [/LINK_INVALID|SESSION_CLOSED|SESSION_COMPLETED/, "This link expired or was already used. Go back to WhatsApp and ask for a new one."],
  [/TENANT_NOT_BILLABLE|BOT_DISABLED/, "This store isn't taking orders right now."],
  [/OUTSIDE_HOURS/, "The store is closed at the moment. Please try again when it opens."],
  [/PRODUCT_UNAVAILABLE/, "Some products are no longer available. Refresh the page and choose again."],
  [/SESSION_WITH_AGENT/, "An agent is helping you on WhatsApp. Please continue the order there."],
  [/ITEMS_INVALID/, "Check the quantities and try again."],
];

export async function submitWebOrder(input: unknown): Promise<SubmitResult> {
  const parsed = submitOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the quantities and try again." };
  const { token, items } = parsed.data;

  // Anti abuso: por IP y por enlace (el token se guarda con hash SHA-256, nunca en claro).
  const blocked = await takeAttempt(["webOrderIp", await getClientIp()], ["webOrderToken", token]);
  if (blocked) return { ok: false, error: blocked };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("submit_web_order", {
    p_token: token,
    p_items: items.map((item) => ({ product_id: item.productId, quantity: item.quantity })),
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    const message = error?.message ?? "";
    const known = ERRORS.find(([pattern]) => pattern.test(message));
    if (!known) console.error(`[storefront] submit_web_order falló: ${message.slice(0, 80)}`);
    return { ok: false, error: known?.[1] ?? "We couldn't send your order. Please try again." };
  }

  const tenantId = typeof data.tenant_id === "string" ? data.tenant_id : null;
  const sessionId = typeof data.session_id === "string" ? data.session_id : null;
  if (tenantId) await logAudit({ actorId: null, action: "WEB_ORDER_SUBMITTED", resource: "carts", tenantId });

  // El pedido ya quedó en el carrito de la conversación; ahora se le muestra el resumen en el chat.
  let notified = false;
  try {
    const ctx = tenantId && sessionId ? await loadSessionContext(admin, tenantId, sessionId) : null;
    if (ctx) {
      await sendCartSummary(ctx);
      notified = true;
    }
  } catch (cause) {
    console.error(`[storefront] No se pudo enviar el resumen al chat: ${cause instanceof Error ? cause.message.slice(0, 80) : "?"}`);
  }
  return { ok: true, notified };
}
