/**
 * Webhook de Stripe: mantiene al día la suscripción y los pagos de cada comercio.
 *
 * Seguridad (no hay sesión: la firma ES la autenticación):
 *   1. Se verifica la firma con el cuerpo CRUDO y STRIPE_WEBHOOK_SECRET (constructEvent). Firma inválida → 400.
 *   2. Idempotencia: cada evento se registra en stripe_events (llave única); un reintento de Stripe ya
 *      procesado responde 200 sin repetir. Si el procesamiento falla se borra la marca y se responde 500
 *      para que Stripe lo reintente.
 *   3. Nunca se confía en el contenido del evento: se vuelve a pedir la suscripción a la API de Stripe.
 * Sin STRIPE_SECRET_KEY o STRIPE_WEBHOOK_SECRET responde 503 (falla cerrado).
 * (No se exporta `runtime`: con cacheComponents Next 16 lo rechaza; corre en Node.js por defecto.)
 */
import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getServerEnv } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/stripe";
import { recordInvoice, syncSubscription } from "@/lib/stripe/sync";

const SUBSCRIPTION_EVENTS = ["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"];
const INVOICE_EVENTS = ["invoice.paid", "invoice.payment_failed", "invoice.payment_succeeded", "invoice.finalized"];

async function handleEvent(event: Stripe.Event): Promise<void> {
  const stripe = getStripe();
  if (SUBSCRIPTION_EVENTS.includes(event.type)) {
    await syncSubscription((event.data.object as Stripe.Subscription).id);
  } else if (INVOICE_EVENTS.includes(event.type)) {
    const invoice = event.data.object as Stripe.Invoice;
    const parent = (invoice as unknown as { parent?: { subscription_details?: { subscription?: string | { id: string } } } }).parent;
    const subscriptionRef = parent?.subscription_details?.subscription;
    const subscriptionId = typeof subscriptionRef === "string" ? subscriptionRef : subscriptionRef?.id;
    if (subscriptionId) await syncSubscription(subscriptionId); // primero la suscripción: la factura se asocia a ella
    // Se relee la factura en Stripe (el cuerpo del evento no es la fuente de verdad).
    if (invoice.id) await recordInvoice(await stripe.invoices.retrieve(invoice.id));
  } else if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    if (subscriptionId) await syncSubscription(subscriptionId);
  }
}

export async function POST(request: NextRequest) {
  const { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } = getServerEnv();
  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) return new NextResponse("Not configured", { status: 503 });

  const signature = request.headers.get("stripe-signature");
  if (!signature) return new NextResponse("Missing signature", { status: 400 });
  const raw = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, signature, STRIPE_WEBHOOK_SECRET);
  } catch {
    return new NextResponse("Invalid signature", { status: 400 });
  }

  const admin = createAdminClient();
  const { error: markError } = await admin.from("stripe_events").insert({ event_id: event.id, type: event.type });
  if (markError) {
    if (markError.code === "23505") return new NextResponse("ok", { status: 200 }); // ya procesado
    return new NextResponse("Unavailable", { status: 500 });
  }

  try {
    await handleEvent(event);
  } catch (error) {
    await admin.from("stripe_events").delete().eq("event_id", event.id); // para que Stripe lo reintente
    console.error(`[stripe] Evento ${event.type} falló: ${error instanceof Error ? error.message.slice(0, 80) : "?"}`);
    return new NextResponse("Processing failed", { status: 500 });
  }
  return new NextResponse("ok", { status: 200 });
}
