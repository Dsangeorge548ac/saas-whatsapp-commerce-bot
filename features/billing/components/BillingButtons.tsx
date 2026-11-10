"use client";
/**
 * Botones de cobro: "Subscribe" (abre Stripe Checkout) y "Manage billing" (portal de Stripe).
 * La Server Action devuelve la URL de Stripe y el navegador va allí; la app nunca ve datos de tarjeta.
 */
import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notify } from "@/components/feedback/notify";
import { openBillingPortal, startCheckout, type BillingResult } from "@/features/billing/actions";
import type { BillingInterval } from "@/lib/stripe/plans";

function useStripeRedirect() {
  const [isPending, startTransition] = useTransition();
  const run = (task: () => Promise<BillingResult>) =>
    startTransition(async () => {
      const result = await task();
      if (!result.ok) return notify.error(result.error);
      window.location.assign(result.url);
    });
  return { isPending, run };
}

export function SubscribeButton({ planId, planName, highlighted, interval }: { planId: string; planName: string; highlighted: boolean; interval: BillingInterval }) {
  const { isPending, run } = useStripeRedirect();
  return (
    <Button variant={highlighted ? "accent" : "default"} className="h-11 w-full" disabled={isPending} onClick={() => run(() => startCheckout(planId, interval))} aria-label={`Subscribe to ${planName} (${interval})`}>
      {isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {interval === "yearly" ? "Subscribe yearly" : "Subscribe monthly"}
    </Button>
  );
}

export function ManageBillingButton({ variant = "outline" }: { variant?: "outline" | "default" }) {
  const { isPending, run } = useStripeRedirect();
  return (
    <Button variant={variant} disabled={isPending} onClick={() => run(() => openBillingPortal())}>
      {isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
      Manage billing
    </Button>
  );
}
