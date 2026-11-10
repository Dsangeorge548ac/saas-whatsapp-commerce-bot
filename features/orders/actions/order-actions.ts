"use server";
/**
 * Server Actions del tablero de pedidos (dueño u operador con suscripción vigente).
 *
 * Patrón: 1) comprobar quién opera y que el comercio esté facturable, 2) validar con Zod, 3) llamar a la
 * función de la base con la sesión del usuario (advance_order / review_proof validan quién llama, la
 * secuencia de estados y la suscripción otra vez, dejan historial y auditoría), 4) avisar al cliente por
 * WhatsApp. Si el aviso falla, el cambio YA quedó hecho: se devuelve una advertencia, no un error.
 * Seguridad: los motivos del operador no se registran en logs; el id del pedido siempre se vuelve a
 * resolver en la base (RLS) y nunca se confía en datos del navegador.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOperatorContext } from "@/lib/auth/operator";
import { notifyOrderStatus, notifyProofRejected } from "@/features/whatsapp/order-notifications";
import { NOT_FOUND, advanceTargetSchema, orderIdSchema, reasonSchema, type ActionResult } from "@/features/orders/schemas";

const NOTIFY_WARNING = "The change was saved, but we couldn't message the customer on WhatsApp. Write to them manually if needed.";

/** Mensaje claro para los errores conocidos de las funciones de la base. */
function friendlyError(message: string): string {
  if (message.includes("Invalid order transition")) return "This order can't move to that status from where it is. Refresh the board.";
  if (message.includes("reason is required")) return "Write a short reason first.";
  if (message.includes("already reviewed")) return "Another team member already reviewed this proof.";
  if (message.includes("Not found")) return "Not found.";
  return "We couldn't complete that action. Please try again.";
}

async function notify(task: () => Promise<void>): Promise<string | undefined> {
  try {
    await task();
    return undefined;
  } catch {
    return NOTIFY_WARNING; // el motivo técnico no se muestra ni se registra con datos del cliente
  }
}

/** Acepta el comprobante: el pedido pasa a Approved y se avisa al cliente. */
export async function approveProof(proofId: unknown, orderId: unknown): Promise<ActionResult> {
  const operator = await getOperatorContext();
  const proof = z.uuid().safeParse(proofId);
  const order = orderIdSchema.safeParse(orderId);
  if (!operator || !proof.success || !order.success) return NOT_FOUND;

  const { error } = await operator.supabase.rpc("review_proof", { p_proof: proof.data, p_decision: "accept" });
  if (error) return { ok: false, error: friendlyError(error.message) };
  const warning = await notify(() => notifyOrderStatus(createAdminClient(), order.data));
  revalidatePath("/orders");
  return { ok: true, warning };
}

/** Rechaza el comprobante con un motivo: el cliente recibe el motivo y se le vuelve a pedir el pago. */
export async function rejectProof(proofId: unknown, reason: unknown): Promise<ActionResult> {
  const operator = await getOperatorContext();
  const proof = z.uuid().safeParse(proofId);
  const text = reasonSchema.safeParse(reason);
  if (!operator || !proof.success) return NOT_FOUND;
  if (!text.success) return { ok: false, error: text.error.issues[0]?.message ?? "Write a short reason." };

  const { error } = await operator.supabase.rpc("review_proof", { p_proof: proof.data, p_decision: "reject", p_reason: text.data });
  if (error) return { ok: false, error: friendlyError(error.message) };
  const warning = await notify(() => notifyProofRejected(createAdminClient(), proof.data));
  revalidatePath("/orders");
  return { ok: true, warning };
}

/** Avanza el pedido a "On the way" o "Delivered". Aprobar va por la revisión del comprobante. */
export async function advanceOrder(orderId: unknown, target: unknown): Promise<ActionResult> {
  const operator = await getOperatorContext();
  const order = orderIdSchema.safeParse(orderId);
  const to = advanceTargetSchema.safeParse(target);
  if (!operator || !order.success || !to.success) return NOT_FOUND;

  const { error } = await operator.supabase.rpc("advance_order", { p_order: order.data, p_to: to.data });
  if (error) return { ok: false, error: friendlyError(error.message) };
  const warning = await notify(() => notifyOrderStatus(createAdminClient(), order.data));
  revalidatePath("/orders");
  return { ok: true, warning };
}

/** Cancela el pedido (desde sin pagar, pendiente o aprobado) con un motivo obligatorio. */
export async function cancelOrder(orderId: unknown, reason: unknown): Promise<ActionResult> {
  const operator = await getOperatorContext();
  const order = orderIdSchema.safeParse(orderId);
  const text = reasonSchema.safeParse(reason);
  if (!operator || !order.success) return NOT_FOUND;
  if (!text.success) return { ok: false, error: text.error.issues[0]?.message ?? "Write a short reason." };

  const { error } = await operator.supabase.rpc("advance_order", { p_order: order.data, p_to: "cancelled", p_reason: text.data });
  if (error) return { ok: false, error: friendlyError(error.message) };
  const warning = await notify(() => notifyOrderStatus(createAdminClient(), order.data));
  revalidatePath("/orders");
  return { ok: true, warning };
}
