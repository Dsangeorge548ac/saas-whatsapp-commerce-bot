/**
 * Sincroniza la suscripción y los pagos de un comercio con Stripe (solo servidor).
 *
 * Regla de oro: STRIPE ES LA FUENTE DE VERDAD. Siempre se pide el objeto a la API de Stripe (nunca se
 * activa nada por lo que diga una URL o un cuerpo recibido) y se guarda con la service role, porque los
 * usuarios no tienen permiso de escritura en tenant_subscriptions ni payments.
 * Se usa desde el webhook de Stripe y desde /api/billing/return (al volver del pago).
 * El comercio sale de metadata.tenant_id de la suscripción (la pone nuestro Checkout) y se comprueba que exista.
 */
import "server-only";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/stripe";
import { INTERVAL_BY_LOOKUP_KEY, PLAN_BY_LOOKUP_KEY } from "@/lib/stripe/plans";
import { mapInvoiceStatus, mapSubscriptionStatus, nextPastDueSince, unixToIso } from "@/lib/stripe/mapping";

type Admin = ReturnType<typeof createAdminClient>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idOf = (value: string | { id: string } | null | undefined) => (typeof value === "string" ? value : (value?.id ?? null));

/** Comercio dueño de la suscripción: metadata.tenant_id o, si falta, el cliente de Stripe ya conocido. */
async function resolveTenant(admin: Admin, subscription: Stripe.Subscription): Promise<string | null> {
  const fromMetadata = subscription.metadata?.tenant_id;
  if (fromMetadata && UUID.test(fromMetadata)) {
    const { data } = await admin.from("tenants").select("id").eq("id", fromMetadata).maybeSingle();
    if (data) return data.id;
  }
  const customerId = idOf(subscription.customer);
  if (!customerId) return null;
  const { data } = await admin.from("tenant_subscriptions").select("tenant_id").eq("stripe_customer_id", customerId).maybeSingle();
  return data?.tenant_id ?? null;
}

/** Lee la suscripción en Stripe y la deja guardada. Devuelve el comercio al que pertenece (o null). */
export async function syncSubscription(subscriptionId: string, admin: Admin = createAdminClient()): Promise<string | null> {
  const subscription = await getStripe().subscriptions.retrieve(subscriptionId, { expand: ["items.data.price"] });
  const tenantId = await resolveTenant(admin, subscription);
  if (!tenantId) return null;

  const item = subscription.items.data[0];
  const plan = item?.price.lookup_key ? PLAN_BY_LOOKUP_KEY.get(item.price.lookup_key) : undefined;
  if (!item || !plan) throw new Error("UNKNOWN_PRICE"); // un precio que no es de un plan nuestro: no se adivina

  const { data: previous } = await admin.from("tenant_subscriptions").select("activated_at, past_due_since").eq("tenant_id", tenantId).maybeSingle();
  const status = mapSubscriptionStatus(subscription.status);
  const now = new Date();

  const { error } = await admin.from("tenant_subscriptions").upsert(
    {
      tenant_id: tenantId,
      plan_id: plan.id,
      status,
      stripe_customer_id: idOf(subscription.customer),
      stripe_subscription_id: subscription.id,
      stripe_price_id: item.price.id,
      billing_interval: INTERVAL_BY_LOOKUP_KEY.get(item.price.lookup_key ?? "") ?? null,
      activated_at: previous?.activated_at ?? (status === "active" || status === "trialing" ? now.toISOString() : null),
      billing_cycle_anchor: unixToIso(subscription.billing_cycle_anchor),
      current_period_start: unixToIso(item.current_period_start),
      current_period_end: unixToIso(item.current_period_end),
      cancel_at_period_end: subscription.cancel_at_period_end,
      canceled_at: unixToIso(subscription.canceled_at),
      past_due_since: nextPastDueSince(status, previous?.past_due_since ?? null, now),
    },
    { onConflict: "tenant_id" },
  );
  if (error) throw new Error("SUBSCRIPTION_SAVE_FAILED");
  return tenantId;
}

/** Guarda (o actualiza) una factura como pago del comercio. */
export async function recordInvoice(invoice: Stripe.Invoice, admin: Admin = createAdminClient()): Promise<void> {
  const parent = (invoice as unknown as { parent?: { subscription_details?: { subscription?: string | { id: string } } } }).parent;
  const subscriptionId = idOf(parent?.subscription_details?.subscription);
  const customerId = idOf(invoice.customer as string | { id: string } | null);

  const lookup = subscriptionId
    ? await admin.from("tenant_subscriptions").select("tenant_id").eq("stripe_subscription_id", subscriptionId).maybeSingle()
    : customerId
      ? await admin.from("tenant_subscriptions").select("tenant_id").eq("stripe_customer_id", customerId).maybeSingle()
      : { data: null };
  const tenantId = lookup.data?.tenant_id;
  if (!tenantId || !invoice.id) return;

  const line = invoice.lines?.data?.[0];
  // Stripe deja la factura como "paid" aunque se haya reembolsado: un pago ya marcado `refunded` no se revierte.
  const { data: existing } = await admin.from("payments").select("status").eq("stripe_invoice_id", invoice.id).maybeSingle();
  const status = existing?.status === "refunded" ? "refunded" : mapInvoiceStatus(invoice.status);
  const { error } = await admin.from("payments").upsert(
    {
      tenant_id: tenantId,
      stripe_invoice_id: invoice.id,
      amount_cents: invoice.amount_paid > 0 ? invoice.amount_paid : invoice.amount_due,
      currency: invoice.currency.toLowerCase(),
      status,
      period_start: unixToIso(line?.period?.start),
      period_end: unixToIso(line?.period?.end),
      paid_at: unixToIso(invoice.status_transitions?.paid_at),
      failure_reason: status === "failed" ? "Payment could not be collected" : null,
      hosted_invoice_url: invoice.hosted_invoice_url ?? null,
    },
    { onConflict: "stripe_invoice_id" },
  );
  if (error) throw new Error("PAYMENT_SAVE_FAILED");
}

/**
 * Reembolsa por completo el pago de una factura (lo usa el staff desde /admin/subscriptions). La factura sale de la
 * base de datos, nunca del navegador. Idempotente: Stripe rechaza un segundo reembolso con la misma clave.
 * Después marca el pago como `refunded` (deja de sumar en "Collected this month").
 */
export async function refundInvoice(invoiceId: string, admin: Admin = createAdminClient()): Promise<void> {
  const stripe = getStripe();
  const payments = await stripe.invoicePayments.list({ invoice: invoiceId, limit: 1, expand: ["data.payment.payment_intent"] });
  const payment = payments.data[0]?.payment;
  const intent = payment && "payment_intent" in payment ? payment.payment_intent : null;
  const intentId = typeof intent === "string" ? intent : intent?.id;
  if (!intentId) throw new Error("NO_PAYMENT_INTENT");
  await stripe.refunds.create({ payment_intent: intentId }, { idempotencyKey: `wabot-refund-${invoiceId}` });
  const { error } = await admin.from("payments").update({ status: "refunded" }).eq("stripe_invoice_id", invoiceId);
  if (error) throw new Error("PAYMENT_SAVE_FAILED");
}
