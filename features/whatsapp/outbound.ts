/**
 * Mensajes salientes del bot: enviar, registrar en `messages` y resolver los textos editables.
 *
 *   - send(): manda cualquier tipo de mensaje y deja constancia (wamid, tipo, texto, `kind` en el payload).
 *     Si Meta rechaza el envío (token vencido, fuera de la ventana de 24 h…) también queda registrado como
 *     fallido y el error sube para que el evento del webhook quede marcado y se pueda reintentar.
 *   - say(): envía un mensaje estándar. El texto es el que el comercio personalizó (tenant_messages) o, si
 *     no, el por defecto de su tipo de negocio. Los {placeholders} los completa este módulo; nunca se
 *     evalúa nada del comercio.
 * Quién lo usa: los flujos de features/whatsapp/flows/*.
 */
import "server-only";
import type { Json } from "@/types/database";
import { sendMessage, type OutboundContent } from "@/lib/whatsapp/client";
import { renderTemplate } from "@/lib/whatsapp/format";
import type { Ctx } from "@/features/whatsapp/types";

/** Quién envía el mensaje: el bot (por defecto) o un miembro del equipo (queda registrado para auditar humano vs. automático). */
export type Sender = { type: "bot" } | { type: "operator"; userId: string };

export async function send(ctx: Ctx, content: OutboundContent, kind: string, sender: Sender = { type: "bot" }): Promise<void> {
  const base = {
    tenant_id: ctx.tenant.id,
    customer_id: ctx.customer.id,
    session_id: ctx.session.id,
    direction: "outbound" as const,
    sender_type: sender.type,
    sender_user_id: sender.type === "operator" ? sender.userId : null,
    message_type: content.kind === "text" ? ("text" as const) : ("interactive" as const),
    body: content.body.slice(0, 4096),
    payload: { kind } as Json,
  };
  try {
    const { wamid } = await sendMessage(ctx.creds, ctx.customer.phone, content);
    await ctx.admin.from("messages").insert({ ...base, wamid, delivery_status: "sent" });
  } catch (error) {
    await ctx.admin.from("messages").insert({ ...base, wamid: null, delivery_status: "failed" });
    throw error;
  }
}

/** Texto de un mensaje estándar: personalizado por el comercio o el por defecto de su tipo de negocio. */
export async function loadMessage(ctx: Ctx, key: string): Promise<string> {
  const { data: custom } = await ctx.admin
    .from("tenant_messages")
    .select("body, is_enabled")
    .eq("tenant_id", ctx.tenant.id)
    .eq("key", key)
    .maybeSingle();
  if (custom?.is_enabled) return custom.body;

  const { data: defaults } = await ctx.admin
    .from("message_template_defaults")
    .select("body, business_type")
    .eq("key", key)
    .eq("locale", "es")
    .in("business_type", [ctx.tenant.businessType, "all"]);
  const chosen = defaults?.find((row) => row.business_type === ctx.tenant.businessType) ?? defaults?.find((row) => row.business_type === "all");
  return chosen?.body ?? "";
}

/** Envía un mensaje estándar con sus {placeholders}. */
export async function say(ctx: Ctx, key: string, vars: Record<string, string> = {}): Promise<void> {
  const template = await loadMessage(ctx, key);
  if (!template) return;
  const body = renderTemplate(template, {
    business_name: ctx.tenant.businessName,
    customer_name: ctx.customer.name ?? "",
    ...vars,
  });
  await send(ctx, { kind: "text", body }, key);
}

/** Texto fijo (errores y avisos que no son plantillas editables). */
export async function sayText(ctx: Ctx, body: string, kind: string): Promise<void> {
  await send(ctx, { kind: "text", body }, kind);
}
