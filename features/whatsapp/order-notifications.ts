/**
 * Avisos al cliente cuando cambia el estado de su pedido o se rechaza su comprobante.
 *
 * El estado del pedido solo empieza a mostrarse al cliente DESPUÉS del pago (comprobante recibido):
 * aprobado → "en preparación", en camino (con botón "Ya lo recibí") y entregado. Los textos son las
 * plantillas editables del comercio.
 * Quién lo usa: las Server Actions del tablero Kanban (módulo Orders) justo después de advance_order() y
 * review_proof(). Esas acciones ya validaron sesión, rol y suscripción; este módulo solo envía.
 * Nota: fuera de la ventana de 24 h de WhatsApp un mensaje libre falla; ese caso necesita plantillas
 * aprobadas por Meta (fase posterior). El fallo queda registrado en `messages` (delivery_status = failed).
 */
import "server-only";
import { formatMoney, renderTemplate } from "@/lib/whatsapp/format";
import { loadCredentials, loadTenant } from "@/features/whatsapp/context";
import { loadMessage, say, send, sayText } from "@/features/whatsapp/outbound";
import { setState } from "@/features/whatsapp/session";
import { TEXT } from "@/features/whatsapp/texts";
import type { Admin, Ctx } from "@/features/whatsapp/types";

async function buildContext(admin: Admin, order: { tenant_id: string; customer_id: string }): Promise<Ctx | null> {
  const [tenant, customer] = await Promise.all([
    loadTenant(admin, order.tenant_id),
    admin.from("customers").select("id, phone_e164, profile_name").eq("id", order.customer_id).eq("tenant_id", order.tenant_id).maybeSingle(),
  ]);
  if (!tenant || !customer.data) return null;
  const creds = await loadCredentials(admin, order.tenant_id);
  const { data: session } = await admin.rpc("get_or_create_session", { p_tenant: order.tenant_id, p_customer: customer.data.id });
  if (!session) return null;
  return { admin, tenant, creds, customer: { id: customer.data.id, phone: customer.data.phone_e164, name: customer.data.profile_name }, session, wamid: null };
}

export async function notifyOrderStatus(admin: Admin, orderId: string): Promise<void> {
  const { data: order } = await admin.from("orders").select("id, tenant_id, customer_id, order_number, status, total, currency").eq("id", orderId).maybeSingle();
  if (!order) return;
  const ctx = await buildContext(admin, order);
  if (!ctx) return;
  const vars = { order_number: String(order.order_number) };
  // Si la conversación seguía esperando la revisión de ESTE pedido, vuelve al inicio.
  const reset = async () => {
    if (ctx.session.state === "awaiting_review" || ctx.session.state === "awaiting_proof") await setState(ctx, "idle", null);
  };

  switch (order.status) {
    case "approved":
      await say(ctx, "order_approved", vars);
      return reset();
    case "on_the_way": {
      const body = [await loadMessage(ctx, "order_on_the_way"), await loadMessage(ctx, "confirm_delivery_prompt")]
        .map((text) => renderTemplate(text, vars))
        .filter(Boolean)
        .join("\n\n");
      return send(ctx, { kind: "buttons", body, buttons: [{ id: `delivered:${order.id}`, title: TEXT.receivedYes }] }, "order_on_the_way");
    }
    case "delivered":
      await say(ctx, "order_delivered", vars);
      return reset();
    case "cancelled":
      await sayText(ctx, TEXT.orderCancelled(order.order_number), "order_cancelled");
      return reset();
    default:
      return; // awaiting_payment / pending: nada que avisar
  }
}

/** El operador rechazó el comprobante: se avisa con el motivo y se vuelve a pedir el pago. */
export async function notifyProofRejected(admin: Admin, proofId: string): Promise<void> {
  const { data: proof } = await admin.from("payment_proofs").select("order_id, tenant_id, status, rejection_reason").eq("id", proofId).maybeSingle();
  if (!proof || proof.status !== "rejected") return;
  const { data: order } = await admin.from("orders").select("id, tenant_id, customer_id, order_number, total, currency").eq("id", proof.order_id).maybeSingle();
  if (!order) return;
  const ctx = await buildContext(admin, order);
  if (!ctx) return;

  await say(ctx, "proof_rejected", { order_number: String(order.order_number), reason: proof.rejection_reason ?? "" });
  await say(ctx, "ask_proof", { order_number: String(order.order_number), total: formatMoney(order.total, order.currency) });
  if (ctx.session.state === "awaiting_review") await setState(ctx, "awaiting_proof", { orderId: order.id });
}
