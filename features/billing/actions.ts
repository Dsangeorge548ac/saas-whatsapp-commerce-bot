"use server";
/**
 * Server Actions de suscripción (solo el dueño): iniciar el pago en Stripe Checkout y abrir el portal de
 * facturación. La app NUNCA toca datos de tarjeta: se capturan en Stripe.
 *
 * Seguridad: se vuelve a comprobar que sea el dueño; el plan se valida contra la lista permitida y el precio
 * se busca en Stripe por su lookup_key (nunca llega del navegador); la suscripción y el cliente de Stripe se
 * ligan al comercio con metadata.tenant_id y client_reference_id, y al volver del pago se comprueba que
 * coincidan. Sin suscripción vigente no se puede iniciar otro pago (se evita pagar dos veces).
 */
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { getOwnerContext } from "@/lib/auth/owner";
import { publicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLAN_BY_ID, isBillingInterval, isPlanId } from "@/lib/stripe/plans";
import { getStripe, isStripeConfigured } from "@/lib/stripe/stripe";
import { getWorkspace } from "@/lib/data/workspace";

export type BillingResult = { ok: true; url: string } | { ok: false; error: string };
const LIVE_STATUSES = ["active", "trialing", "past_due"];
const NOT_CONFIGURED: BillingResult = { ok: false, error: "Payments aren't available yet. Please contact support." };

/** Cliente de Stripe del comercio: el guardado, o uno existente con su metadata, o uno nuevo. */
async function ensureCustomer(tenantId: string, email: string, knownId: string | null): Promise<string> {
  if (knownId) return knownId;
  const stripe = getStripe();
  const found = await stripe.customers.search({ query: `metadata['tenant_id']:'${tenantId}'`, limit: 1 });
  const existing = found.data[0];
  if (existing) return existing.id;
  const created = await stripe.customers.create({ email, metadata: { tenant_id: tenantId, app: "wabot" } }, { idempotencyKey: `wabot-customer-${tenantId}` });
  return created.id;
}

/** Inicia el pago del plan y periodo elegidos (mensual o anual con 17% de descuento). */
export async function startCheckout(planId: unknown, interval: unknown = "monthly"): Promise<BillingResult> {
  const owner = await getOwnerContext();
  const plan = z.string().refine(isPlanId).safeParse(planId);
  // El periodo también se valida: solo "monthly" o "yearly"; el precio sale de nuestra lista, no del navegador.
  if (!owner || !plan.success || !isBillingInterval(interval)) return { ok: false, error: "Not found." };
  if (!isStripeConfigured()) return NOT_CONFIGURED;

  const admin = createAdminClient();
  const { data: current } = await admin.from("tenant_subscriptions").select("status, stripe_customer_id").eq("tenant_id", owner.tenantId).maybeSingle();
  if (current && LIVE_STATUSES.includes(current.status)) return { ok: false, error: "You already have a plan. Use “Manage billing” to change or cancel it." };

  const workspace = await getWorkspace();
  const email = workspace?.user.email;
  if (!email) return { ok: false, error: "Not found." };

  try {
    const stripe = getStripe();
    const definition = PLAN_BY_ID.get(plan.data as never);
    if (!definition) return { ok: false, error: "Not found." };
    const lookupKey = definition.prices[interval].lookupKey;
    const prices = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
    const price = prices.data[0];
    if (!price) return { ok: false, error: "This plan isn't available yet. Please contact support." };

    const customer = await ensureCustomer(owner.tenantId, email, current?.stripe_customer_id ?? null);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      line_items: [{ price: price.id, quantity: 1 }],
      client_reference_id: owner.tenantId,
      subscription_data: { metadata: { tenant_id: owner.tenantId, app: "wabot" } },
      success_url: `${publicEnv.NEXT_PUBLIC_APP_URL}/api/billing/return?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${publicEnv.NEXT_PUBLIC_APP_URL}/settings/billing?checkout=canceled`,
    });
    if (!session.url) return { ok: false, error: "We couldn't start the payment. Please try again." };
    await logAudit({ actorId: owner.userId, action: "CHECKOUT_STARTED", resource: "tenant_subscriptions", tenantId: owner.tenantId, details: { plan: definition.id, interval } });
    return { ok: true, url: session.url };
  } catch (error) {
    console.error(`[billing] Checkout falló: ${error instanceof Error ? error.message.slice(0, 80) : "?"}`);
    return { ok: false, error: "We couldn't start the payment. Please try again." };
  }
}

/** Portal de Stripe: cambiar tarjeta, ver facturas, cambiar de plan o cancelar. */
export async function openBillingPortal(): Promise<BillingResult> {
  const owner = await getOwnerContext();
  if (!owner) return { ok: false, error: "Not found." };
  if (!isStripeConfigured()) return NOT_CONFIGURED;

  const { data } = await createAdminClient().from("tenant_subscriptions").select("stripe_customer_id").eq("tenant_id", owner.tenantId).maybeSingle();
  if (!data?.stripe_customer_id) return { ok: false, error: "There's no subscription to manage yet." };

  try {
    const stripe = getStripe();
    // La cuenta de Stripe se comparte con otro proyecto: se usa SIEMPRE la configuración propia del portal.
    const configs = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
    const ours = configs.data.find((config) => config.metadata?.app === "wabot");
    if (!ours) return { ok: false, error: "The billing portal isn't set up yet. Please contact support." };
    const session = await stripe.billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      configuration: ours.id,
      return_url: `${publicEnv.NEXT_PUBLIC_APP_URL}/settings/billing`,
    });
    return { ok: true, url: session.url };
  } catch (error) {
    console.error(`[billing] Portal falló: ${error instanceof Error ? error.message.slice(0, 80) : "?"}`);
    return { ok: false, error: "We couldn't open the billing portal. Please try again." };
  }
}
