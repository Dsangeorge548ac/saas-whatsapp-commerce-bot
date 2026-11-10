/**
 * npm run stripe:setup — prepara Stripe (modo TEST) para los planes de la plataforma. Se puede correr varias veces.
 *
 * Crea, si no existen:
 *   1. Un producto por plan (metadata.app = "wabot", metadata.plan) con el código fiscal de SaaS
 *      (requisito de Stripe Managed Payments; sin él Checkout falla en cuentas que lo tienen activo).
 *   2. Sus precios mensual y anual (17% de descuento) con su lookup_key (montos de lib/stripe/plans.ts).
 *      Si el monto cambia, crea el precio nuevo y le pasa la lookup_key.
 *   3. Una configuración propia del portal de facturación (la cuenta de Stripe se comparte con otro
 *      proyecto, así que NO se toca la configuración por defecto): actualizar tarjeta, ver facturas,
 *      cambiar de plan y cancelar al final del periodo.
 * Seguridad: lee STRIPE_SECRET_KEY de .env.local y nunca la imprime. Se niega a correr con una clave live.
 */
import Stripe from "stripe";
import { BILLING_INTERVALS, PLANS, type PlanPrice } from "../lib/stripe/plans";

const key = process.env.STRIPE_SECRET_KEY;
if (!key?.startsWith("sk_")) throw new Error("Falta STRIPE_SECRET_KEY en .env.local.");
if (!key.startsWith("sk_test_")) throw new Error("Usa una clave de TEST (sk_test_…) para este script.");

const stripe = new Stripe(key);
const APP = "wabot";
const BRAND = process.env.NEXT_PUBLIC_APP_NAME || "Astra";
const TAX_CODE = "txcd_10103001"; // Software as a service (SaaS) - business use

async function ensureProduct(plan: (typeof PLANS)[number]): Promise<string> {
  const products = await stripe.products.list({ active: true, limit: 100 });
  const existing = products.data.find((product) => product.metadata.app === APP && product.metadata.plan === plan.id);
  if (existing) {
    // Si cambió el nombre de la marca o la descripción, se actualiza (lo ven los clientes en Checkout y facturas).
    const name = `${BRAND} ${plan.name}`;
    if (existing.name !== name || existing.description !== plan.tagline) await stripe.products.update(existing.id, { name, description: plan.tagline });
    return existing.id;
  }
  const created = await stripe.products.create({
    name: `${BRAND} ${plan.name}`,
    description: plan.tagline,
    tax_code: TAX_CODE,
    metadata: { app: APP, plan: plan.id },
  });
  return created.id;
}

async function ensurePrice(plan: (typeof PLANS)[number], price: PlanPrice, productId: string): Promise<string> {
  const found = await stripe.prices.list({ lookup_keys: [price.lookupKey], active: true, limit: 1 });
  const current = found.data[0];
  if (current && current.unit_amount === price.amountCents && current.recurring?.interval === price.stripeInterval) return current.id;
  const created = await stripe.prices.create({
    product: productId,
    currency: "usd",
    unit_amount: price.amountCents,
    recurring: { interval: price.stripeInterval },
    lookup_key: price.lookupKey,
    transfer_lookup_key: true,
    metadata: { app: APP, plan: plan.id },
  });
  return created.id;
}

async function ensurePortal(products: { product: string; prices: string[] }[]) {
  const configs = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
  const existing = configs.data.find((config) => config.metadata?.app === APP);
  const features = {
    payment_method_update: { enabled: true },
    invoice_history: { enabled: true },
    subscription_cancel: { enabled: true, mode: "at_period_end" as const },
    subscription_update: { enabled: true, default_allowed_updates: ["price" as const], proration_behavior: "none" as const, products },
  };
  const business_profile = { headline: `${BRAND} billing` };
  if (existing) return stripe.billingPortal.configurations.update(existing.id, { features, business_profile });
  return stripe.billingPortal.configurations.create({ features, business_profile, metadata: { app: APP } });
}

async function main() {
  const catalog: { product: string; prices: string[] }[] = [];
  for (const plan of PLANS) {
    const product = await ensureProduct(plan);
    const prices: string[] = [];
    for (const interval of BILLING_INTERVALS) {
      prices.push(await ensurePrice(plan, plan.prices[interval], product));
      console.log(`✓ ${plan.name}: ${plan.prices[interval].lookupKey}`);
    }
    catalog.push({ product, prices });
  }
  await ensurePortal(catalog);
  console.log("✓ Portal de facturación configurado");
}

main().catch((error) => {
  console.error("Falló stripe:setup:", error instanceof Error ? error.message : error);
  process.exit(1);
});
