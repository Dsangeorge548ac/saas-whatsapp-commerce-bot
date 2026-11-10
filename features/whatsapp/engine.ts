/**
 * Motor de conversación: decide qué hacer con cada mensaje del cliente según su estado (FSM).
 *
 * Orden de las compuertas (la primera que aplica responde y termina):
 *   1. Conversación con un asesor humano → el bot NO responde (el mensaje ya quedó registrado).
 *   2. Botón "Ya lo recibí" → cierra el pedido (vale en cualquier estado).
 *   3. Comercio sin bot activo o sin suscripción vigente → aviso "no tomamos pedidos" (máx. 1 por hora).
 *   4. Fuera del horario de atención → mensaje con la apertura y el cierre.
 *   5. Palabras de reinicio ("menú", "hola"…) antes de pagar → menú principal.
 *   6. Manejador del estado actual.
 * La base de datos vuelve a imponer las reglas críticas (suscripción, horario, secuencia de estados),
 * así que estas compuertas son comodidad para el cliente, no la única defensa.
 */
import "server-only";
import type { InboundContent } from "@/lib/whatsapp/payload";
import { handleBrowsing, showMainMenu } from "@/features/whatsapp/flows/browse";
import {
  handleAddress,
  handleCartConfirmation,
  handleLocation,
  handleNotes,
  handlePaymentMethod,
} from "@/features/whatsapp/flows/checkout";
import { confirmDelivery, handleProof, handleReview } from "@/features/whatsapp/flows/payment";
import { openStatus, sendOutOfHours } from "@/features/whatsapp/hours";
import { say } from "@/features/whatsapp/outbound";
import type { Ctx, SessionState } from "@/features/whatsapp/types";

const BROWSING: SessionState[] = ["idle", "browsing_menu", "browsing_catalog", "building_cart", "human_handoff", "closed"];
const BEFORE_PAYMENT: SessionState[] = [
  ...BROWSING,
  "awaiting_cart_confirmation",
  "awaiting_location",
  "awaiting_address",
  "awaiting_notes",
  "awaiting_payment_method",
];
const RESET_WORDS = /^(menu|menú|inicio|hola|buenas|buenos días|buenas tardes|buenas noches|hi|hello|start)$/i;

/** Aviso de comercio pausado, como máximo una vez por hora por cliente (evita bucles de respuestas). */
async function sendPausedNotice(ctx: Ctx): Promise<void> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recent } = await ctx.admin
    .from("messages")
    .select("id")
    .eq("tenant_id", ctx.tenant.id)
    .eq("customer_id", ctx.customer.id)
    .eq("direction", "outbound")
    .gte("created_at", since)
    .contains("payload", { kind: "shop_paused" })
    .limit(1);
  if (recent?.length) return;
  await say(ctx, "shop_paused");
}

export async function handleMessage(ctx: Ctx, content: InboundContent): Promise<void> {
  const state = ctx.session.state;

  if (ctx.session.mode === "human") return;

  if (content.type === "reply" && content.replyId.startsWith("delivered:")) {
    return confirmDelivery(ctx, content.replyId.slice("delivered:".length));
  }

  if (!ctx.tenant.botEnabled || !ctx.tenant.billable) return sendPausedNotice(ctx);

  if (BROWSING.includes(state)) {
    const status = await openStatus(ctx);
    if (!status.is_open) return sendOutOfHours(ctx, status);
  }

  if (content.type === "text" && RESET_WORDS.test(content.body.trim()) && BEFORE_PAYMENT.includes(state)) {
    return showMainMenu(ctx, { greet: state === "idle" });
  }

  switch (state) {
    case "awaiting_cart_confirmation":
      return handleCartConfirmation(ctx, content);
    case "awaiting_location":
      return handleLocation(ctx, content);
    case "awaiting_address":
      return handleAddress(ctx, content);
    case "awaiting_notes":
      return handleNotes(ctx, content);
    case "awaiting_payment_method":
      return handlePaymentMethod(ctx, content);
    case "awaiting_proof":
      return handleProof(ctx, content);
    case "awaiting_review":
      return handleReview(ctx);
    default:
      return handleBrowsing(ctx, content);
  }
}
