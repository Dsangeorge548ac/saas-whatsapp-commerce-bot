/**
 * Flujo de pago: recibir el comprobante, esperar la revisión y confirmar la entrega.
 *
 *   - awaiting_proof: el cliente manda una imagen/PDF (se baja de Meta y se guarda en el bucket PRIVADO
 *     payment-proofs, solo por ruta, nunca URL) o escribe el número de referencia. Al insertar el
 *     comprobante, un trigger de la base pasa el pedido de `awaiting_payment` a `pending` y avisa a los
 *     operadores: desde ahí empieza a verse el estado del pedido.
 *   - awaiting_review: el pedido se está validando.
 *   - confirmDelivery: el botón "Ya lo recibí" cierra el pedido como `delivered` (actor: cliente).
 * Seguridad: el comprobante pertenece al pedido de ESTE cliente (se comprueba), el tipo y el tamaño se
 * limitan antes de guardar, y los errores nunca incluyen el token ni datos del cliente.
 */
import "server-only";
import { ALLOWED_PROOF_MIME, WhatsAppApiError, downloadMedia } from "@/lib/whatsapp/client";
import type { InboundContent } from "@/lib/whatsapp/payload";
import { say, sayText } from "@/features/whatsapp/outbound";
import { readContext, setState } from "@/features/whatsapp/session";
import { TEXT } from "@/features/whatsapp/texts";
import type { Ctx } from "@/features/whatsapp/types";
import { showMainMenu } from "@/features/whatsapp/flows/browse";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFERENCE = /^[\w\-./ ]{4,60}$/;
const safeName = (text: string) => text.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);

async function loadOrder(ctx: Ctx, orderId: string) {
  const { data } = await ctx.admin
    .from("orders")
    .select("id, order_number, status")
    .eq("id", orderId)
    .eq("tenant_id", ctx.tenant.id)
    .eq("customer_id", ctx.customer.id) // el pedido tiene que ser de ESTE cliente
    .maybeSingle();
  return data;
}

/** Guarda el archivo del comprobante en Storage y devuelve su ruta (null si no se pudo usar). */
async function storeProofFile(ctx: Ctx, content: Extract<InboundContent, { type: "media" }>): Promise<string | null> {
  // Sin token solo ocurre en el modo simulado de desarrollo: no hay archivo que bajar.
  if (!ctx.creds.token) return `dry-run/${safeName(content.mediaId)}`;
  try {
    const { buffer, mimeType } = await downloadMedia(ctx.creds.token, content.mediaId);
    const orderId = readContext(ctx).orderId ?? "unknown";
    const path = `${ctx.tenant.id}/${orderId}/${safeName(ctx.wamid ?? content.mediaId)}.${ALLOWED_PROOF_MIME[mimeType]}`;
    const { error } = await ctx.admin.storage.from("payment-proofs").upload(path, buffer, { contentType: mimeType, upsert: false });
    if (error) throw new Error("PROOF_UPLOAD_FAILED");
    return path;
  } catch (error) {
    if (error instanceof WhatsAppApiError) throw error; // token vencido o fallo de Meta: el evento se reintenta
    return null; // tipo o tamaño no permitidos
  }
}

export async function handleProof(ctx: Ctx, content: InboundContent): Promise<void> {
  const orderId = readContext(ctx).orderId;
  const order = orderId ? await loadOrder(ctx, orderId) : null;
  if (!order || order.status === "cancelled" || order.status === "delivered") {
    await sayText(ctx, TEXT.orderExpired, "order_expired");
    return showMainMenu(ctx, { greet: false });
  }

  let storagePath: string | null = null;
  let reference: string | null = null;
  if (content.type === "media") {
    storagePath = await storeProofFile(ctx, content);
    if (!storagePath) return void (await sayText(ctx, TEXT.proofBad, "proof_bad"));
    reference = content.caption && REFERENCE.test(content.caption.trim()) ? content.caption.trim() : null;
  } else if (content.type === "text" && REFERENCE.test(content.body.trim())) {
    reference = content.body.trim();
  } else {
    return say(ctx, "ask_proof", { order_number: String(order.order_number) });
  }

  const { error } = await ctx.admin.from("payment_proofs").insert({
    tenant_id: ctx.tenant.id,
    order_id: order.id,
    storage_path: storagePath,
    reference_number: reference,
  });
  if (error) {
    // Ya hay un comprobante esperando revisión (índice único): no se duplica, solo se confirma.
    if (error.code !== "23505") {
      if (error.message.includes("not awaiting payment")) {
        await sayText(ctx, TEXT.orderExpired, "order_expired");
        return showMainMenu(ctx, { greet: false });
      }
      throw new Error("PROOF_INSERT_FAILED");
    }
  }
  await setState(ctx, "awaiting_review");
  return say(ctx, "proof_received", { order_number: String(order.order_number) });
}

export async function handleReview(ctx: Ctx): Promise<void> {
  const orderId = readContext(ctx).orderId;
  const order = orderId ? await loadOrder(ctx, orderId) : null;
  if (!order || order.status === "delivered" || order.status === "cancelled") return showMainMenu(ctx, { greet: false });
  if (order.status === "pending") return sayText(ctx, TEXT.inReview(order.order_number), "in_review");
  return sayText(ctx, TEXT.orderStatus(order.order_number, order.status === "approved" ? "en preparación" : "en camino"), "order_status");
}

/** El cliente confirma que recibió el pedido (botón del mensaje "va en camino"). */
export async function confirmDelivery(ctx: Ctx, orderId: string): Promise<void> {
  if (!UUID.test(orderId)) return;
  const order = await loadOrder(ctx, orderId);
  if (!order) return;
  if (order.status === "delivered") return void (await sayText(ctx, TEXT.alreadyDelivered, "already_delivered"));
  if (order.status !== "on_the_way") return;
  const { error } = await ctx.admin.rpc("advance_order_system", {
    p_order: order.id,
    p_to: "delivered",
    p_actor: "customer",
    p_reason: "Customer confirmed delivery",
  });
  if (error) throw new Error("DELIVERY_CONFIRM_FAILED");
  await say(ctx, "order_delivered", { order_number: String(order.order_number) });
}
