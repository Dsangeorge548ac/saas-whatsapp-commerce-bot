"use server";
/**
 * Server Actions del staff sobre suscripciones pagadas (/admin/subscriptions y el detalle de un usuario).
 * SOLO el rol `developer`. Igual que en Tax Pro, todas:
 *   1. exigen developer con la sesión verificada y validan con Zod (solo plan, modo y motivo);
 *   2. buscan la suscripción del comercio en la base: el navegador NUNCA manda ids de Stripe ni precios;
 *   3. aplican el cambio EN STRIPE y de inmediato lo copian a la base (lib/stripe/sync.ts), igual que el webhook
 *      (si solo se tocara la base, el siguiente evento lo pisaría);
 *   4. dejan constancia en la auditoría con el motivo.
 * Cambiar de plan conserva el periodo (mensual/anual) y el día de renovación: el precio nuevo se cobra desde la
 * próxima renovación, sin cargo ni reembolso ahora. Reembolsar devuelve el ÚLTIMO pago completo.
 */
import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import { getDeveloperContext } from "@/lib/auth/platform";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLAN_BY_ID, type BillingInterval } from "@/lib/stripe/plans";
import { getStripe, isStripeConfigured } from "@/lib/stripe/stripe";
import { recordInvoice, refundInvoice, syncSubscription } from "@/lib/stripe/sync";
import { cancelSubscriptionSchema, planIdSchema, reasonSchema, userIdSchema } from "@/features/admin/schemas";
import type { ActionResult } from "@/features/auth/schemas";

const NOT_ALLOWED: ActionResult = { ok: false, error: "You don't have permission to do this." };
const STRIPE_OFF: ActionResult = { ok: false, error: "Stripe isn't configured in this environment." };
const FAILED: ActionResult = { ok: false, error: "Stripe couldn't complete this. Try again or check the Stripe dashboard." };
/** Estados en los que Stripe todavía permite modificar la suscripción. */
const MODIFIABLE = ["active", "trialing", "past_due", "unpaid", "paused"];

type Checked = { userId: string; tenantId: string; reason: string };

/** Comprobaciones comunes: developer, id de comercio válido, motivo y Stripe configurado. */
async function check(tenantId: unknown, reason: unknown): Promise<Checked | ActionResult> {
  const dev = await getDeveloperContext();
  if (!dev) return NOT_ALLOWED;
  const id = userIdSchema.safeParse(tenantId);
  const why = reasonSchema.safeParse(reason);
  if (!id.success) return { ok: false, error: "Not found." };
  if (!why.success) return { ok: false, error: why.error.issues[0]?.message ?? "Write a reason." };
  if (!isStripeConfigured()) return STRIPE_OFF;
  return { userId: dev.userId, tenantId: id.data, reason: why.data };
}

/** Suscripción del comercio según la BASE (el id de Stripe nunca viene del navegador). */
async function loadSubscription(tenantId: string) {
  const { data } = await createAdminClient()
    .from("tenant_subscriptions")
    .select("stripe_subscription_id, plan_id, status, cancel_at_period_end, billing_interval")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return data?.stripe_subscription_id ? { ...data, stripe_subscription_id: data.stripe_subscription_id } : null;
}

/** Reembolsa el último pago cobrado del comercio. false si no hay ninguno. */
async function refundLastPayment(tenantId: string): Promise<boolean> {
  const { data: payment } = await createAdminClient()
    .from("payments")
    .select("stripe_invoice_id")
    .eq("tenant_id", tenantId)
    .eq("status", "paid")
    .order("paid_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (!payment?.stripe_invoice_id) return false;
  await refundInvoice(payment.stripe_invoice_id);
  return true;
}

const done = (message: string): ActionResult => {
  revalidatePath("/admin", "layout");
  return { ok: true, message };
};

export async function adminChangeSubscriptionPlan(tenantId: unknown, plan: unknown, reason: unknown): Promise<ActionResult> {
  const ctx = await check(tenantId, reason);
  if ("ok" in ctx) return ctx;
  const target = planIdSchema.safeParse(plan);
  if (!target.success) return { ok: false, error: "Choose a valid plan." };

  const current = await loadSubscription(ctx.tenantId);
  if (!current || !MODIFIABLE.includes(current.status)) return { ok: false, error: "This subscription can't be changed because it has ended." };
  if (current.plan_id === target.data) return { ok: false, error: "The business is already on this plan." };
  const interval: BillingInterval = current.billing_interval === "yearly" ? "yearly" : "monthly";

  try {
    const stripe = getStripe();
    const lookupKey = PLAN_BY_ID.get(target.data)!.prices[interval].lookupKey;
    const prices = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
    const price = prices.data[0];
    if (!price) return { ok: false, error: "That plan isn't available in Stripe yet. Run npm run stripe:setup." };
    const subscription = await stripe.subscriptions.retrieve(current.stripe_subscription_id);
    const item = subscription.items.data[0];
    if (!item) return FAILED;
    // Sin prorrateo: no se cobra ni se reembolsa ahora y el día de renovación no cambia.
    await stripe.subscriptions.update(subscription.id, { items: [{ id: item.id, price: price.id }], proration_behavior: "none" });
    await syncSubscription(subscription.id);
  } catch {
    return FAILED;
  }
  await logAudit({ actorId: ctx.userId, tenantId: ctx.tenantId, action: "ADMIN_SUBSCRIPTION_PLAN_CHANGED", resource: "tenant_subscriptions", details: { from: current.plan_id, to: target.data, interval, reason: ctx.reason } });
  return done(`Plan changed to ${PLAN_BY_ID.get(target.data)!.name}. The new price applies from the next renewal.`);
}

export async function adminCancelSubscription(tenantId: unknown, input: unknown, reason: unknown): Promise<ActionResult> {
  const ctx = await check(tenantId, reason);
  if ("ok" in ctx) return ctx;
  const data = cancelSubscriptionSchema.safeParse(input);
  if (!data.success) return { ok: false, error: "Choose when the subscription should end." };

  const current = await loadSubscription(ctx.tenantId);
  if (!current || !MODIFIABLE.includes(current.status)) return { ok: false, error: "This subscription has already ended." };
  try {
    const stripe = getStripe();
    if (data.data.mode === "now") await stripe.subscriptions.cancel(current.stripe_subscription_id);
    else await stripe.subscriptions.update(current.stripe_subscription_id, { cancel_at_period_end: true });
    await syncSubscription(current.stripe_subscription_id);
  } catch {
    return FAILED;
  }

  // Reembolso opcional del último pago. Si falla, la cancelación ya está hecha: se avisa aparte.
  let refundNote = "";
  if (data.data.refund) {
    try {
      refundNote = (await refundLastPayment(ctx.tenantId)) ? " The last payment was refunded." : " There was no paid payment to refund.";
    } catch {
      refundNote = " The refund failed: use Refund to try again.";
    }
  }
  await logAudit({ actorId: ctx.userId, tenantId: ctx.tenantId, action: "ADMIN_SUBSCRIPTION_CANCELED", resource: "tenant_subscriptions", details: { mode: data.data.mode, refund: data.data.refund, reason: ctx.reason } });
  return done((data.data.mode === "now" ? "Subscription canceled. Access ended now." : "The subscription will end at the close of the current period.") + refundNote);
}

export async function adminKeepSubscription(tenantId: unknown, reason: unknown): Promise<ActionResult> {
  const ctx = await check(tenantId, reason);
  if ("ok" in ctx) return ctx;
  const current = await loadSubscription(ctx.tenantId);
  if (!current || !MODIFIABLE.includes(current.status)) return { ok: false, error: "This subscription has already ended." };
  if (!current.cancel_at_period_end) return { ok: false, error: "This subscription isn't scheduled to cancel." };
  try {
    await getStripe().subscriptions.update(current.stripe_subscription_id, { cancel_at_period_end: false });
    await syncSubscription(current.stripe_subscription_id);
  } catch {
    return FAILED;
  }
  await logAudit({ actorId: ctx.userId, tenantId: ctx.tenantId, action: "ADMIN_SUBSCRIPTION_RESUMED", resource: "tenant_subscriptions", details: { reason: ctx.reason } });
  return done("Cancellation reverted. The subscription will renew as usual.");
}

export async function adminRefundLastPayment(tenantId: unknown, reason: unknown): Promise<ActionResult> {
  const ctx = await check(tenantId, reason);
  if ("ok" in ctx) return ctx;
  try {
    if (!(await refundLastPayment(ctx.tenantId))) return { ok: false, error: "There's no paid payment to refund." };
  } catch {
    return { ok: false, error: "Stripe couldn't refund this payment. Try again or refund it from the Stripe dashboard." };
  }
  await logAudit({ actorId: ctx.userId, tenantId: ctx.tenantId, action: "ADMIN_PAYMENT_REFUNDED", resource: "payments", details: { reason: ctx.reason } });
  return done("Payment refunded. The money goes back to the customer's card in 5–10 business days.");
}

/** Vuelve a leer de Stripe las suscripciones y sus últimas facturas (útil si el webhook no está activo). Máx. 50. */
export async function adminSyncSubscriptions(): Promise<ActionResult> {
  const dev = await getDeveloperContext();
  if (!dev) return NOT_ALLOWED;
  if (!isStripeConfigured()) return STRIPE_OFF;
  const { data: rows } = await createAdminClient()
    .from("tenant_subscriptions")
    .select("stripe_subscription_id")
    .not("stripe_subscription_id", "is", null)
    .order("updated_at", { ascending: true })
    .limit(50);

  const stripe = getStripe();
  let synced = 0;
  for (const row of rows ?? []) {
    if (!row.stripe_subscription_id) continue;
    try {
      await syncSubscription(row.stripe_subscription_id);
      const invoices = await stripe.invoices.list({ subscription: row.stripe_subscription_id, limit: 5 });
      for (const invoice of invoices.data) if (invoice.status !== "draft") await recordInvoice(invoice);
      synced += 1;
    } catch {
      // Una suscripción con problemas no detiene a las demás.
    }
  }
  await logAudit({ actorId: dev.userId, action: "ADMIN_SUBSCRIPTIONS_SYNCED", resource: "tenant_subscriptions", details: { count: synced } });
  return done(`Synced ${synced} ${synced === 1 ? "subscription" : "subscriptions"} with Stripe.`);
}
