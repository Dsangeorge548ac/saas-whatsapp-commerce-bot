/**
 * Flujo de compra: confirmar el carrito → delivery o retiro → ubicación GPS → referencia de la
 * dirección → notas → método de pago → pedido creado (en `awaiting_payment`).
 *
 * Cada paso corresponde a un estado de la FSM (awaiting_cart_confirmation, awaiting_location,
 * awaiting_address, awaiting_notes, awaiting_payment_method). Los ids de respuesta llevan prefijo:
 * `cart:confirm|cancel`, `ful:delivery|pickup` y `pm:<id>`.
 * El pedido lo crea la función create_order_from_cart() de la base (una transacción: re-precia, valida
 * disponibilidad, horario, límites del plan y ubicación, y congela los datos). Este código solo reúne
 * los datos y traduce sus errores a mensajes para el cliente.
 */
import "server-only";
import { formatMoney, formatPaymentDetails, renderTemplate } from "@/lib/whatsapp/format";
import type { InboundContent } from "@/lib/whatsapp/payload";
import { sendOutOfHours } from "@/features/whatsapp/hours";
import { loadMessage, say, send, sayText } from "@/features/whatsapp/outbound";
import { readContext, requestHandoff, setState } from "@/features/whatsapp/session";
import { TEXT } from "@/features/whatsapp/texts";
import type { Ctx } from "@/features/whatsapp/types";
import { showMainMenu } from "@/features/whatsapp/flows/browse";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clip = (text: string, max: number) => text.trim().slice(0, max);

async function activeCart(ctx: Ctx) {
  const { data: cart } = await ctx.admin
    .from("carts")
    .select("id")
    .eq("session_id", ctx.session.id)
    .eq("tenant_id", ctx.tenant.id)
    .eq("status", "active")
    .maybeSingle();
  if (!cart) return null;
  const { data: items } = await ctx.admin.from("cart_items").select("product_id, quantity, unit_price_snapshot").eq("cart_id", cart.id);
  const ids = (items ?? []).map((item) => item.product_id);
  const { data: products } = ids.length ? await ctx.admin.from("products").select("id, name").in("id", ids) : { data: [] };
  const names = new Map((products ?? []).map((product) => [product.id, product.name]));
  return {
    id: cart.id,
    lines: (items ?? []).map((item) => ({ name: names.get(item.product_id) ?? "—", quantity: item.quantity, unitPrice: item.unit_price_snapshot })),
  };
}

/** Resumen del pedido con botones Confirmar / Cancelar. También lo usa el envío del pedido web. */
export async function sendCartSummary(ctx: Ctx): Promise<void> {
  const cart = await activeCart(ctx);
  if (!cart || cart.lines.length === 0) {
    await sayText(ctx, TEXT.cartEmpty, "cart_empty");
    return showMainMenu(ctx, { greet: false });
  }
  const total = cart.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const items = cart.lines.map((line) => `${line.quantity} × ${line.name} — ${formatMoney(line.quantity * line.unitPrice, ctx.tenant.currency)}`).join("\n");
  const body = renderTemplate(await loadMessage(ctx, "cart_summary"), { items, total: formatMoney(total, ctx.tenant.currency) });
  await send(ctx, { kind: "buttons", body, buttons: [{ id: "cart:confirm", title: TEXT.confirm }, { id: "cart:cancel", title: TEXT.cancel }] }, "cart_summary");
  if (ctx.session.state !== "awaiting_cart_confirmation" || readContext(ctx).step !== "confirm") {
    await setState(ctx, "awaiting_cart_confirmation", { step: "confirm" });
  }
}

async function requestLocation(ctx: Ctx): Promise<void> {
  const body = renderTemplate(await loadMessage(ctx, "ask_location"), { business_name: ctx.tenant.businessName });
  await send(ctx, { kind: "location_request", body }, "ask_location");
}

async function chooseFulfillment(ctx: Ctx, fulfillment: "delivery" | "pickup"): Promise<void> {
  if (fulfillment === "delivery") {
    await setState(ctx, "awaiting_location", { fulfillment, step: undefined });
    return requestLocation(ctx);
  }
  await setState(ctx, "awaiting_notes", { fulfillment, step: undefined, lat: undefined, lng: undefined, address: undefined });
  return say(ctx, "ask_notes");
}

async function askFulfillment(ctx: Ctx): Promise<void> {
  const { acceptsDelivery, acceptsPickup } = ctx.tenant;
  if (acceptsDelivery && !acceptsPickup) return chooseFulfillment(ctx, "delivery");
  if (acceptsPickup && !acceptsDelivery) return chooseFulfillment(ctx, "pickup");
  const body = renderTemplate(await loadMessage(ctx, "ask_fulfillment"), {});
  await send(ctx, { kind: "buttons", body, buttons: [{ id: "ful:delivery", title: TEXT.delivery }, { id: "ful:pickup", title: TEXT.pickup }] }, "ask_fulfillment");
  await setState(ctx, "awaiting_cart_confirmation", { step: "fulfillment" });
}

export async function handleCartConfirmation(ctx: Ctx, content: InboundContent): Promise<void> {
  if (content.type === "reply") {
    if (content.replyId === "cart:cancel") {
      await ctx.admin.from("carts").update({ status: "abandoned" }).eq("session_id", ctx.session.id).eq("status", "active");
      await sayText(ctx, TEXT.cartCancelled, "cart_cancelled");
      return showMainMenu(ctx, { greet: false });
    }
    if (content.replyId === "cart:confirm") return askFulfillment(ctx);
    if (content.replyId === "ful:delivery" && ctx.tenant.acceptsDelivery) return chooseFulfillment(ctx, "delivery");
    if (content.replyId === "ful:pickup" && ctx.tenant.acceptsPickup) return chooseFulfillment(ctx, "pickup");
  }
  return readContext(ctx).step === "fulfillment" ? askFulfillment(ctx) : sendCartSummary(ctx);
}

export async function handleLocation(ctx: Ctx, content: InboundContent): Promise<void> {
  if (content.type === "location") {
    await setState(ctx, "awaiting_address", { lat: content.lat, lng: content.lng });
    await say(ctx, "location_received");
    return say(ctx, "ask_address");
  }
  // Si el comercio no exige GPS, una dirección escrita basta.
  if (!ctx.tenant.requireDeliveryLocation && content.type === "text" && content.body.trim()) {
    await setState(ctx, "awaiting_notes", { address: clip(content.body, 500) });
    return say(ctx, "ask_notes");
  }
  await say(ctx, "location_invalid");
  return requestLocation(ctx);
}

export async function handleAddress(ctx: Ctx, content: InboundContent): Promise<void> {
  if (content.type === "location") {
    await setState(ctx, "awaiting_address", { lat: content.lat, lng: content.lng });
    return say(ctx, "location_received");
  }
  if (content.type === "text" && content.body.trim()) {
    await setState(ctx, "awaiting_notes", { address: clip(content.body, 500) });
    return say(ctx, "ask_notes");
  }
  return say(ctx, "ask_address");
}

export async function handleNotes(ctx: Ctx, content: InboundContent): Promise<void> {
  if (content.type !== "text" || !content.body.trim()) return say(ctx, "ask_notes");
  const text = clip(content.body, 500);
  const notes = /^(no|nop|ninguna|ninguno|nada|n\/a|-)$/i.test(text) ? undefined : text;
  await setState(ctx, "awaiting_payment_method", { notes });
  return askPaymentMethod(ctx);
}

async function askPaymentMethod(ctx: Ctx): Promise<void> {
  const { data: methods } = await ctx.admin
    .from("tenant_payment_methods")
    .select("id, label")
    .eq("tenant_id", ctx.tenant.id)
    .eq("is_active", true)
    .order("sort_order")
    .order("created_at")
    .limit(10);
  const first = methods?.[0];
  if (!first) {
    await requestHandoff(ctx);
    return say(ctx, "handoff_to_agent");
  }
  if (methods.length === 1) return createOrder(ctx, first.id);
  if (methods.length <= 3) {
    return send(ctx, { kind: "buttons", body: TEXT.askPaymentMethod, buttons: methods.map((m) => ({ id: `pm:${m.id}`, title: m.label })) }, "ask_payment_method");
  }
  return send(
    ctx,
    { kind: "list", body: TEXT.askPaymentMethod, buttonLabel: "Ver métodos", rows: methods.map((m) => ({ id: `pm:${m.id}`, title: m.label })) },
    "ask_payment_method",
  );
}

export async function handlePaymentMethod(ctx: Ctx, content: InboundContent): Promise<void> {
  if (content.type === "reply" && content.replyId.startsWith("pm:") && UUID.test(content.replyId.slice(3))) {
    return createOrder(ctx, content.replyId.slice(3));
  }
  return askPaymentMethod(ctx);
}

/** Crea el pedido con la función de la base y envía las instrucciones de pago. */
async function createOrder(ctx: Ctx, paymentMethodId: string): Promise<void> {
  if (!ctx.wamid) throw new Error("WAMID_REQUIRED"); // la idempotencia del pedido depende del wamid
  const cart = await activeCart(ctx);
  if (!cart) return orderError(ctx, "CART_EMPTY");
  const context = readContext(ctx);

  const { data: orderId, error } = await ctx.admin.rpc("create_order_from_cart", {
    p_cart: cart.id,
    p_fulfillment: context.fulfillment ?? "pickup",
    p_address: context.address ?? "",
    p_notes: context.notes ?? "",
    p_payment_method: paymentMethodId,
    p_source_wamid: ctx.wamid,
    p_lat: context.lat,
    p_lng: context.lng,
  });
  if (error || !orderId) return orderError(ctx, error?.message ?? "UNKNOWN");

  const { data: order } = await ctx.admin
    .from("orders")
    .select("order_number, total, currency, payment_details_snapshot")
    .eq("id", orderId)
    .eq("tenant_id", ctx.tenant.id)
    .single();
  if (!order) throw new Error("ORDER_NOT_FOUND");

  await setState(ctx, "awaiting_proof", { orderId });
  await say(ctx, "payment_instructions", {
    order_number: String(order.order_number),
    total: formatMoney(order.total, order.currency),
    payment_details: formatPaymentDetails(order.payment_details_snapshot),
  });
}

/** Traduce los errores de create_order_from_cart() a mensajes para el cliente (sin detalles internos). */
async function orderError(ctx: Ctx, message: string): Promise<void> {
  if (message.includes("OUTSIDE_HOURS")) return sendOutOfHours(ctx);
  if (/TENANT_NOT_BILLABLE|BOT_DISABLED|ORDER_LIMIT_REACHED/.test(message)) return say(ctx, "shop_paused");
  if (/PRODUCT_UNAVAILABLE|CART_EMPTY|CART_NOT_ACTIVE|CART_NOT_FOUND/.test(message)) {
    await sayText(ctx, TEXT.orderUnavailable, "order_unavailable");
    return showMainMenu(ctx, { greet: false });
  }
  if (message.includes("LOCATION_REQUIRED") || message.includes("LOCATION_INVALID")) {
    await setState(ctx, "awaiting_location");
    return requestLocation(ctx);
  }
  console.error(`[whatsapp] create_order_from_cart falló: ${message.slice(0, 80)}`);
  await sayText(ctx, TEXT.genericError, "error");
}
