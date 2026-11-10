/**
 * Tarjeta con la que se cobra una suscripción (marca, últimos 4 y vencimiento) para mostrarla en Billing.
 * Se pide a Stripe en el servidor; nunca se guarda en la base ni se muestra el número completo (Stripe no lo da).
 * Si Stripe no responde o no hay tarjeta, devuelve null y la página simplemente no muestra la fila.
 */
import "server-only";
import type Stripe from "stripe";
import { getStripe, isStripeConfigured } from "@/lib/stripe/stripe";

export type CardSummary = { brand: string; last4: string; expMonth: number; expYear: number };

function cardOf(method: string | Stripe.PaymentMethod | null | undefined): CardSummary | null {
  if (!method || typeof method === "string" || !method.card) return null;
  return { brand: method.card.brand, last4: method.card.last4, expMonth: method.card.exp_month, expYear: method.card.exp_year };
}

export async function getSubscriptionCard(subscriptionId: string | null): Promise<CardSummary | null> {
  if (!subscriptionId || !isStripeConfigured()) return null;
  try {
    const stripe = getStripe();
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["default_payment_method", "customer.invoice_settings.default_payment_method"] });
    const direct = cardOf(subscription.default_payment_method as Stripe.PaymentMethod | string | null);
    if (direct) return direct;
    const customer = subscription.customer;
    if (customer && typeof customer !== "string" && !customer.deleted) {
      return cardOf(customer.invoice_settings?.default_payment_method as Stripe.PaymentMethod | string | null);
    }
    return null;
  } catch {
    return null;
  }
}
