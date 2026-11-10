/**
 * Procesa un evento del webhook ya guardado en `webhook_events` (se ejecuta DESPUÉS de responder 200 a Meta).
 *
 * Ciclo de vida: received → processed | failed. Un evento fallido conserva el error (solo un código, sin
 * datos del cliente) y se puede reintentar con retryFailedEvents(). La idempotencia es doble: la llave
 * única del evento (wamid) y la llave única del mensaje (tenant_id, wamid) en `messages`.
 *
 * Mensaje entrante: cliente (upsert por teléfono) → sesión abierta (get_or_create_session) → se registra el
 * mensaje → motor de conversación. Estado de un mensaje saliente: se actualiza su delivery_status.
 * Seguridad: usa la service role (servidor); el texto del cliente es dato no confiable y cada flujo lo valida.
 */
import "server-only";
import type { Json } from "@/types/database";
import type { InboundContent, InboundEvent } from "@/lib/whatsapp/payload";
import { loadCredentials, loadTenant } from "@/features/whatsapp/context";
import { handleMessage } from "@/features/whatsapp/engine";
import type { Admin, Ctx } from "@/features/whatsapp/types";

const STATUSES = ["sent", "delivered", "read", "failed"] as const;
type DeliveryStatus = (typeof STATUSES)[number];

/** Resumen del contenido para la tabla `messages`. La ubicación GPS NO se copia aquí (dato sensible). */
function summarize(content: InboundContent) {
  switch (content.type) {
    case "text":
      return { message_type: "text" as const, body: content.body.slice(0, 4096), payload: {} };
    case "reply":
      return { message_type: "interactive" as const, body: content.title.slice(0, 200), payload: { replyId: content.replyId.slice(0, 256) } };
    case "location":
      return { message_type: "location" as const, body: null, payload: {} };
    case "media":
      return { message_type: content.mediaKind, body: content.caption?.slice(0, 1000) ?? null, payload: { mediaId: content.mediaId } };
    case "other":
      return { message_type: "other" as const, body: null, payload: { rawType: content.rawType.slice(0, 40) } };
  }
}

async function handleInbound(admin: Admin, tenantId: string, event: Extract<InboundEvent, { kind: "message" }>): Promise<void> {
  const tenant = await loadTenant(admin, tenantId);
  if (!tenant || tenant.status !== "active") return;
  const creds = await loadCredentials(admin, tenantId);

  const { data: customer, error } = await admin
    .from("customers")
    .upsert(
      { tenant_id: tenantId, phone_e164: event.from, ...(event.profileName ? { profile_name: event.profileName } : {}) },
      { onConflict: "tenant_id,phone_e164" },
    )
    .select("id, opted_out, profile_name")
    .single();
  if (error || !customer) throw new Error("CUSTOMER_UPSERT_FAILED");
  if (customer.opted_out) return;

  const { data: session, error: sessionError } = await admin.rpc("get_or_create_session", { p_tenant: tenantId, p_customer: customer.id });
  if (sessionError || !session) throw new Error("SESSION_FAILED");

  const summary = summarize(event.content);
  const { error: messageError } = await admin.from("messages").insert({
    tenant_id: tenantId,
    customer_id: customer.id,
    session_id: session.id,
    wamid: event.wamid,
    direction: "inbound",
    sender_type: "customer",
    message_type: summary.message_type,
    body: summary.body,
    payload: summary.payload as Json,
  });
  if (messageError) {
    if (messageError.code === "23505") return; // ya procesado antes: idempotente
    throw new Error("MESSAGE_INSERT_FAILED");
  }

  // Registra la actividad (ventana de 24 h de Meta). El UPDATE sube `version`: se usa la fila devuelta.
  const now = Date.now();
  const { data: touched, error: touchError } = await admin
    .from("conversation_sessions")
    .update({ last_inbound_at: new Date(now).toISOString(), window_expires_at: new Date(now + 24 * 3_600_000).toISOString() })
    .eq("id", session.id)
    .select()
    .single();
  if (touchError || !touched) throw new Error("SESSION_TOUCH_FAILED");

  const ctx: Ctx = {
    admin,
    tenant,
    creds,
    customer: { id: customer.id, phone: event.from, name: customer.profile_name },
    session: touched,
    wamid: event.wamid,
  };
  await handleMessage(ctx, event.content);
}

async function handleStatus(admin: Admin, tenantId: string, event: Extract<InboundEvent, { kind: "status" }>): Promise<void> {
  if (!(STATUSES as readonly string[]).includes(event.status)) return;
  await admin
    .from("messages")
    .update({ delivery_status: event.status as DeliveryStatus })
    .eq("tenant_id", tenantId)
    .eq("wamid", event.wamid)
    .eq("direction", "outbound");
  if (event.status === "failed") console.error(`[whatsapp] Mensaje saliente fallido (código ${event.errorCode ?? "?"})`);
}

/** Procesa un evento guardado y deja su resultado en webhook_events. Nunca lanza. */
export async function processStoredEvent(admin: Admin, eventId: string): Promise<void> {
  const { data: row } = await admin.from("webhook_events").select("id, tenant_id, payload, status, attempts").eq("id", eventId).maybeSingle();
  if (!row || row.status === "processed" || !row.tenant_id) return;

  await admin.from("webhook_events").update({ attempts: row.attempts + 1 }).eq("id", row.id);
  try {
    const event = row.payload as unknown as InboundEvent;
    if (event.kind === "message") await handleInbound(admin, row.tenant_id, event);
    else await handleStatus(admin, row.tenant_id, event);
    await admin.from("webhook_events").update({ status: "processed", processed_at: new Date().toISOString(), last_error: null }).eq("id", row.id);
  } catch (error) {
    // Solo un código corto: el error nunca debe arrastrar datos del cliente ni el token.
    const code = error instanceof Error ? error.message.slice(0, 120) : "UNKNOWN";
    console.error(`[whatsapp] Evento ${row.id} falló: ${code}`);
    await admin.from("webhook_events").update({ status: "failed", last_error: code }).eq("id", row.id);
  }
}

/** Reintenta eventos fallidos (máx. 5 intentos) para el job de reintentos. */
export async function retryFailedEvents(admin: Admin, limit = 25): Promise<number> {
  const { data: rows } = await admin
    .from("webhook_events")
    .select("id")
    .eq("status", "failed")
    .lt("attempts", 5)
    .order("received_at")
    .limit(limit);
  for (const row of rows ?? []) await processStoredEvent(admin, row.id);
  return rows?.length ?? 0;
}
