/**
 * Resumen de la suscripción pagada en /settings/billing (mismo diseño que Tax Pro): cuando el comercio ya pagó, las
 * cards de planes desaparecen y se muestra esta tabla con el plan, su estado, el precio y el periodo, la próxima
 * renovación (o hasta cuándo hay acceso si se canceló), la tarjeta y los límites del plan.
 * Cambiar de plan, de tarjeta, ver facturas o cancelar se hace en "Manage billing" (portal de Stripe).
 * Regla mostrada: se renueva el mismo día en que se activó (mensual: ese día cada mes; anual: esa fecha cada año).
 */
import { CreditCard } from "lucide-react";
import { StatusBadge, type BadgeTone } from "@/components/layout/status-badge";
import { ManageBillingButton } from "@/features/billing/components/BillingButtons";
import type { CardSummary } from "@/lib/stripe/card";
import { formatPlanPrice, type PlanDefinition } from "@/lib/stripe/plans";
import { renewalRule } from "@/features/billing/renewal";

export type SummaryData = {
  plan: PlanDefinition;
  status: string;
  interval: "monthly" | "yearly";
  activatedAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  card: CardSummary | null;
};

const STATUS: Record<string, { tone: BadgeTone; label: string }> = {
  active: { tone: "success", label: "Active" },
  trialing: { tone: "success", label: "Active" },
  past_due: { tone: "danger", label: "Payment failed" },
  unpaid: { tone: "danger", label: "Unpaid" },
};

const longDate = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(iso)) : "—");

function Row({ label, value, badge, action }: { label: string; value?: React.ReactNode; badge?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">{label}{badge}</p>
        {value !== undefined ? <div className="mt-0.5 break-words text-sm text-fg-muted">{value}</div> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function SubscriptionSummary({ data }: { data: SummaryData }) {
  const status = data.cancelAtPeriodEnd ? { tone: "warning" as const, label: "Cancels at period end" } : (STATUS[data.status] ?? { tone: "neutral" as const, label: data.status });
  const price = data.plan.prices[data.interval];
  const problem = data.status === "past_due" || data.status === "unpaid";

  return (
    <section aria-labelledby="your-subscription" className="flex flex-col gap-2">
      <div className="px-1">
        <h2 id="your-subscription" className="text-base font-semibold text-fg">Your subscription</h2>
        <p className="mt-0.5 text-sm text-fg-muted">Change your plan or card, download invoices or cancel from Manage billing.</p>
      </div>
      <div className="divide-y divide-border rounded-lg border border-border bg-surface">
        <Row label={data.plan.name} badge={<StatusBadge tone={status.tone}>{status.label}</StatusBadge>} value={data.plan.tagline} action={<ManageBillingButton />} />
        <Row
          label="Price"
          value={`${formatPlanPrice(price.amountCents)} per ${data.interval === "yearly" ? "year" : "month"}${data.interval === "yearly" ? ` · ${formatPlanPrice(Math.round(price.amountCents / 12))}/mo, billed yearly` : " · billed monthly"}`}
        />
        <Row
          label={data.cancelAtPeriodEnd ? "Access until" : "Next renewal"}
          value={data.cancelAtPeriodEnd ? `${longDate(data.currentPeriodEnd)} · It won't renew. You keep everything until then.` : `${longDate(data.currentPeriodEnd)} · ${renewalRule(data.interval, data.activatedAt)}`}
        />
        <Row
          label="Includes"
          value={`${data.plan.maxUsers ? `Up to ${data.plan.maxUsers} team members` : "Unlimited team members"} · ${data.plan.maxOrdersPerMonth ? `up to ${data.plan.maxOrdersPerMonth.toLocaleString("en-US")} orders a month` : "unlimited orders"}`}
        />
        {data.card ? (
          <Row
            label="Payment method"
            value={
              <span className="inline-flex items-center gap-2">
                <CreditCard className="size-4 text-fg-muted" aria-hidden />
                <span className="capitalize">{data.card.brand}</span> ending in {data.card.last4} · expires {String(data.card.expMonth).padStart(2, "0")}/{data.card.expYear}
              </span>
            }
          />
        ) : null}
        {data.activatedAt ? <Row label="Subscribed since" value={longDate(data.activatedAt)} /> : null}
        {problem ? <Row label="Action needed" value="We couldn't charge your card. Update it in Manage billing within 7 days to keep your bot and team active." /> : null}
      </div>
    </section>
  );
}
