/**
 * GET /api/billing/return?session_id=cs_… — Al volver del pago de Stripe Checkout.
 *
 * Seguridad: exige sesión del DUEÑO y NUNCA activa nada por lo que diga la URL: pide la sesión de Checkout a
 * Stripe, comprueba que su client_reference_id sea el comercio de este usuario y sincroniza la suscripción
 * desde la API de Stripe. El webhook hace lo mismo; este camino solo hace que el plan se vea al instante.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getOwnerContext } from "@/lib/auth/owner";
import { publicEnv } from "@/lib/env";
import { getStripe, isStripeConfigured } from "@/lib/stripe/stripe";
import { syncSubscription } from "@/lib/stripe/sync";

const back = (state: string) => NextResponse.redirect(new URL(`/settings/billing?checkout=${state}`, publicEnv.NEXT_PUBLIC_APP_URL));

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id") ?? "";
  const owner = await getOwnerContext();
  if (!owner || !/^cs_[A-Za-z0-9_]{10,200}$/.test(sessionId) || !isStripeConfigured()) return back("pending");

  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    // La sesión tiene que ser de ESTE comercio (nadie puede reclamar el pago de otro).
    if (session.client_reference_id !== owner.tenantId) return back("pending");
    const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    if (!subscriptionId) return back("pending");
    await syncSubscription(subscriptionId);
    return back("success");
  } catch {
    return back("pending"); // el webhook terminará de sincronizarlo
  }
}
