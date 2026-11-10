"use server";
/**
 * Server Actions de métodos de pago (solo el dueño): los datos que el bot muestra al cliente para pagar
 * (Pago Móvil, transferencia, Zelle, USDT, efectivo…). Se configuran GRATIS.
 * Se valida con Zod (tipo, nombre, moneda y solo los campos que corresponden a ese tipo, cada uno de texto
 * y hasta 200 caracteres) y se escribe con la sesión del usuario: RLS vuelve a exigir "dueño". Cada pedido
 * guarda una COPIA de estos datos al crearse, así que cambiarlos no altera pedidos anteriores.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { getOwnerContext } from "@/lib/auth/owner";
import { NOT_FOUND, PAYMENT_TYPES, paymentMethodSchema, type ActionResult } from "@/features/settings/schemas";

/** Deja solo los campos válidos para el tipo elegido y quita los vacíos. */
function cleanDetails(type: string, details: Record<string, string>): Record<string, string> {
  const allowed = new Set<string>((PAYMENT_TYPES.find((entry) => entry.value === type)?.fields ?? []).map(([key]) => key));
  return Object.fromEntries(Object.entries(details).filter(([key, value]) => allowed.has(key) && value.trim() !== ""));
}

export async function createPaymentMethod(input: unknown): Promise<ActionResult> {
  const owner = await getOwnerContext();
  if (!owner) return NOT_FOUND;
  const parsed = paymentMethodSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the highlighted fields." };

  const { error } = await owner.supabase.from("tenant_payment_methods").insert({
    tenant_id: owner.tenantId,
    type: parsed.data.type,
    label: parsed.data.label,
    currency: parsed.data.currency,
    details: cleanDetails(parsed.data.type, parsed.data.details),
    is_active: parsed.data.isActive,
  });
  if (error) return { ok: false, error: "We couldn't save the payment method." };
  await logAudit({ actorId: owner.userId, action: "PAYMENT_METHOD_CREATED", resource: "tenant_payment_methods", tenantId: owner.tenantId });
  revalidatePath("/settings/payments");
  return { ok: true };
}

export async function updatePaymentMethod(id: unknown, input: unknown): Promise<ActionResult> {
  const owner = await getOwnerContext();
  if (!owner) return NOT_FOUND;
  const parsedId = z.uuid().safeParse(id);
  const parsed = paymentMethodSchema.safeParse(input);
  if (!parsedId.success) return NOT_FOUND;
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the highlighted fields." };

  const { error } = await owner.supabase
    .from("tenant_payment_methods")
    .update({
      type: parsed.data.type,
      label: parsed.data.label,
      currency: parsed.data.currency,
      details: cleanDetails(parsed.data.type, parsed.data.details),
      is_active: parsed.data.isActive,
    })
    .eq("id", parsedId.data)
    .eq("tenant_id", owner.tenantId);
  if (error) return { ok: false, error: "We couldn't save the payment method." };
  await logAudit({ actorId: owner.userId, action: "PAYMENT_METHOD_UPDATED", resource: "tenant_payment_methods", tenantId: owner.tenantId, details: { id: parsedId.data } });
  revalidatePath("/settings/payments");
  return { ok: true };
}

export async function deletePaymentMethod(id: unknown): Promise<ActionResult> {
  const owner = await getOwnerContext();
  if (!owner) return NOT_FOUND;
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) return NOT_FOUND;

  const { error } = await owner.supabase.from("tenant_payment_methods").delete().eq("id", parsedId.data).eq("tenant_id", owner.tenantId);
  if (error) return { ok: false, error: "We couldn't delete the payment method." };
  await logAudit({ actorId: owner.userId, action: "PAYMENT_METHOD_DELETED", resource: "tenant_payment_methods", tenantId: owner.tenantId, details: { id: parsedId.data } });
  revalidatePath("/settings/payments");
  return { ok: true };
}
