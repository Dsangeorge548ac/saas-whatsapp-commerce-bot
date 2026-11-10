/**
 * Traducción entre los estados de Stripe y los de nuestra base de datos (funciones puras, se prueban sin red).
 *
 *   - Estado de la suscripción: Stripe devuelve 8 estados; la base los admite todos (si faltara uno, el
 *     webhook fallaría al guardarlo). Un estado desconocido se trata como `incomplete` (sin acceso).
 *   - Inicio de la gracia de 7 días: cuando la suscripción pasa a `past_due` se anota el momento (y no se
 *     mueve mientras siga así); en cualquier otro estado se borra.
 *   - Estado del pago de una factura.
 */
export type SubscriptionStatus = "incomplete" | "incomplete_expired" | "trialing" | "active" | "past_due" | "canceled" | "unpaid" | "paused";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

const STATUSES: SubscriptionStatus[] = ["incomplete", "incomplete_expired", "trialing", "active", "past_due", "canceled", "unpaid", "paused"];

export function mapSubscriptionStatus(status: string): SubscriptionStatus {
  return (STATUSES as string[]).includes(status) ? (status as SubscriptionStatus) : "incomplete";
}

/** Inicio de la gracia: se conserva el existente si sigue en past_due; se crea al entrar; se borra al salir. */
export function nextPastDueSince(status: SubscriptionStatus, previous: string | null, now: Date = new Date()): string | null {
  if (status !== "past_due") return null;
  return previous ?? now.toISOString();
}

export function mapInvoiceStatus(status: string | null | undefined, amountRefunded = 0): PaymentStatus {
  if (status === "paid") return amountRefunded > 0 ? "refunded" : "paid";
  if (status === "open" || status === "uncollectible" || status === "void") return "failed";
  return "pending";
}

/** Segundos de Unix (Stripe) → ISO. null si no hay valor. */
export function unixToIso(seconds: number | null | undefined): string | null {
  return typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null;
}
