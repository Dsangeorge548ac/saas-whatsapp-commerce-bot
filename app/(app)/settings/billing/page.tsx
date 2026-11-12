/**
 * /settings/billing — Plan y pagos (Stripe).
 *
 * Todo se configura gratis; el plan desbloquea activar el bot, invitar operadores y gestionar pedidos. Con
 * suscripción PAGADA vigente se muestra la tabla "Your subscription" (plan, precio, renovación, tarjeta) y las cards
 * de planes desaparecen, como en Tax Pro; el cambio de plan y la cancelación van por el portal de Stripe. Sin plan
 * pagado (en configuración, con cortesía o tras cancelar) se muestran las cards para elegir uno. El estado sale de la base de datos, que Stripe actualiza por webhook (Stripe es
 * la fuente de verdad). Debajo, el historial de suscripciones (nuevas, activas, canceladas, vencidas y fallidas) y
 * el de pagos. Tras el pago, /api/billing/return sincroniza al instante y redirige aquí.
 */
import { Suspense } from "react";
import type { Metadata } from "next";
import { z } from "zod";
import { TableCard, rowClass, tdClass, thClass, theadClass } from "@/components/data/data-table";
import { Alert } from "@/components/feedback/alert";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/layout/status-badge";
import { ManageBillingButton } from "@/features/billing/components/BillingButtons";
import { PlanCards } from "@/features/billing/components/PlanCards";
import { SubscriptionHistory } from "@/features/billing/components/SubscriptionHistory";
import { SubscriptionSummary } from "@/features/billing/components/SubscriptionSummary";
import { ownHistoryRowSchema } from "@/features/billing/history";
import { getSubscriptionCard } from "@/lib/stripe/card";
import { formatMoney } from "@/lib/whatsapp/format";
import { currentMembership, requireWorkspace } from "@/lib/data/workspace";
import { PLAN_BY_ID, type PlanId } from "@/lib/stripe/plans";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Billing" };

export default function BillingPage({ searchParams }: PageProps<"/settings/billing">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-canvas" aria-busy="true" />}>
      <BillingContent searchParams={searchParams} />
    </Suspense>
  );
}

const date = new Intl.DateTimeFormat("en-US", { dateStyle: "long" });
const LIVE = ["active", "trialing", "past_due"];
const STATUS_TEXT: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  active: { label: "Active", tone: "success" },
  trialing: { label: "Trial", tone: "success" },
  past_due: { label: "Payment failed", tone: "warning" },
  unpaid: { label: "Unpaid", tone: "danger" },
  canceled: { label: "Canceled", tone: "neutral" },
  incomplete: { label: "Incomplete", tone: "neutral" },
  incomplete_expired: { label: "Expired", tone: "neutral" },
  paused: { label: "Paused", tone: "neutral" },
};

async function BillingContent({ searchParams }: Pick<PageProps<"/settings/billing">, "searchParams">) {
  const query = await searchParams;
  const checkout = Array.isArray(query.checkout) ? query.checkout[0] : query.checkout;
  const membership = currentMembership(await requireWorkspace());
  if (!membership) return null;

  const supabase = await createClient();
  const [{ data: subscription }, { data: payments }, { data: historyData }] = await Promise.all([
    supabase.from("tenant_subscriptions").select("plan_id, status, current_period_end, cancel_at_period_end, comp_access_until, past_due_since, billing_interval, activated_at, stripe_subscription_id").eq("tenant_id", membership.tenant_id).maybeSingle(),
    supabase.from("payments").select("id, amount_cents, currency, status, paid_at, created_at, hosted_invoice_url").eq("tenant_id", membership.tenant_id).order("created_at", { ascending: false }).limit(12),
    // Historial de todas sus suscripciones (la base exige que sea el dueño; para otros no devuelve nada).
    supabase.rpc("get_my_subscription_history", { p_tenant: membership.tenant_id }),
  ]);
  const history = z.array(ownHistoryRowSchema).safeParse(historyData ?? []);

  const live = Boolean(subscription && LIVE.includes(subscription.status));
  const complimentary = Boolean(subscription?.comp_access_until && new Date(subscription.comp_access_until) > new Date());
  const plan = subscription ? PLAN_BY_ID.get(subscription.plan_id as PlanId) : undefined;
  // Plan de cortesía (asignado por el equipo de la plataforma, sin cobro): se muestra como tal.
  const status = subscription ? (!live && complimentary ? { label: "Complimentary", tone: "success" as const } : (STATUS_TEXT[subscription.status] ?? STATUS_TEXT.incomplete)) : null;
  // Con un plan PAGADO vigente se muestra la tabla de la suscripción y las cards de planes desaparecen (como Tax Pro).
  const card = live && plan ? await getSubscriptionCard(subscription?.stripe_subscription_id ?? null) : null;

  return (
    <div className="flex flex-col gap-8">
      {checkout === "success" ? <Alert tone="success" title="Payment received">Your plan is active. You can now turn on your bot, invite your team and manage orders.</Alert> : null}
      {checkout === "pending" ? <Alert tone="info" title="We're confirming your payment">This usually takes a few seconds. Refresh this page in a moment.</Alert> : null}
      {checkout === "canceled" ? <Alert tone="info" title="Checkout canceled">No charge was made. You can choose a plan whenever you&apos;re ready.</Alert> : null}
      {subscription?.status === "past_due" ? (
        <Alert tone="warning" title="Your last payment failed" action={<ManageBillingButton variant="default" />}>
          Update your payment method within 7 days to keep your bot and team active.
        </Alert>
      ) : null}

      {live && subscription && plan ? (
        <SubscriptionSummary
          data={{
            plan,
            status: subscription.status,
            interval: subscription.billing_interval === "yearly" ? "yearly" : "monthly",
            activatedAt: subscription.activated_at,
            currentPeriodEnd: subscription.current_period_end,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            card,
          }}
        />
      ) : (
        <>
        {subscription && status ? (
          <section aria-labelledby="current-plan" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 id="current-plan" className="flex flex-wrap items-center gap-2 text-base font-semibold text-fg">
                {plan?.name ?? "Plan"} <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
              </h2>
              <p className="mt-1 text-sm text-fg-muted">
                {complimentary && subscription.comp_access_until
                  ? `Complimentary access from the platform team until ${date.format(new Date(subscription.comp_access_until))}. No charge. You can subscribe to a plan below at any time.`
                  : subscription.status === "canceled"
                    ? "Your subscription has ended. Choose a plan below to subscribe again; your new renewal day will be the day you subscribe."
                    : "No active plan."}
              </p>
            </div>
            {subscription.status === "unpaid" || subscription.status === "canceled" ? <ManageBillingButton /> : null}
          </section>
        ) : (
          <Alert tone="accent" title="You're in setup mode">Choose a plan to turn on your bot, invite your team and manage orders. Everything you set up stays as it is.</Alert>
        )}

        <section aria-labelledby="plans" className="flex flex-col gap-4">
          <div>
            <h2 id="plans" className="text-lg font-semibold tracking-tight text-fg">Choose your plan</h2>
            <p className="mt-1 text-sm text-fg-muted">Pay monthly, or yearly and save 30%. Prices in USD. Your plan renews on the same day you subscribe. Cancel anytime.</p>
          </div>
          <PlanCards currentPlanId={null} canSubscribe />
        </section>
        </>
      )}

      <SubscriptionHistory rows={history.success ? history.data : []} />

      {(payments ?? []).length > 0 ? (
        <section aria-labelledby="history" className="flex flex-col gap-3">
          <h2 id="history" className="text-base font-semibold text-fg">Payment history</h2>
          <TableCard minWidth="28rem">
            <thead className={theadClass}>
              <tr>
                <th scope="col" className={thClass}>Date</th>
                <th scope="col" className={thClass}>Amount</th>
                <th scope="col" className={thClass}>Status</th>
                <th scope="col" className={cn(thClass, "text-right")}>Invoice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(payments ?? []).map((payment) => (
                <tr key={payment.id} className={rowClass}>
                  <td className={cn(tdClass, "whitespace-nowrap text-fg")}>{date.format(new Date(payment.paid_at ?? payment.created_at))}</td>
                  <td className={cn(tdClass, "font-medium text-fg")}>{formatMoney(payment.amount_cents / 100, payment.currency.toUpperCase())}</td>
                  <td className={tdClass}><StatusBadge tone={payment.status === "paid" ? "success" : payment.status === "failed" ? "danger" : "neutral"}>{payment.status}</StatusBadge></td>
                  <td className={cn(tdClass, "text-right")}>
                    {payment.hosted_invoice_url ? (
                      <a href={payment.hosted_invoice_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-fg underline-offset-2 hover:underline">
                        View <i className="ki-filled ki-arrow-up-right text-xs" aria-hidden />
                      </a>
                    ) : <span className="text-fg-muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableCard>
        </section>
      ) : null}
    </div>
  );
}
