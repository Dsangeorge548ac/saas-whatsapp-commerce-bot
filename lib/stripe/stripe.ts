/**
 * Cliente de Stripe (solo servidor). La clave secreta nunca llega al navegador.
 * La app arranca aunque Stripe no esté configurado: las acciones de pago avisan con un mensaje claro.
 */
import "server-only";
import Stripe from "stripe";
import { getServerEnv } from "@/lib/env.server";

let cached: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(getServerEnv().STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe {
  const key = getServerEnv().STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_NOT_CONFIGURED");
  cached ??= new Stripe(key);
  return cached;
}
