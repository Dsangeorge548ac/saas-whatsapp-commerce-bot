"use client";
/**
 * Acciones del developer sobre la suscripción de un comercio (fila de /admin/subscriptions y detalle de usuario):
 *   - Change plan: Starter ↔ Pro ↔ Business conservando mensual/anual; el precio nuevo aplica desde la próxima
 *     renovación (sin cargo ni reembolso ahora).
 *   - Cancel: al final del periodo o de inmediato, con la opción de reembolsar también el último pago.
 *   - Keep: revierte una cancelación programada.
 *   - Refund: devuelve el último pago completo (también después de cancelar).
 *   - AssignPlan / RemoveAssignedPlan: plan de CORTESÍA (sin cobro) hasta una fecha; solo sin suscripción viva.
 *   - SyncButton: vuelve a leer todo de Stripe.
 * Cada acción pide motivo. Las reglas reales están en el servidor (features/admin/*actions.ts) y en Stripe.
 */
import { useState, useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { notify } from "@/components/feedback/notify";
import { Button } from "@/components/ui/button";
import { AdminActionDialog, OptionCard } from "@/features/admin/components/AdminActionDialog";
import { adminAssignPlan, adminRemoveAssignedPlan } from "@/features/admin/actions";
import { adminCancelSubscription, adminChangeSubscriptionPlan, adminKeepSubscription, adminRefundLastPayment, adminSyncSubscriptions } from "@/features/admin/subscription-actions";
import { PLANS, formatPlanPrice, type BillingInterval, type PlanId } from "@/lib/stripe/plans";

type View = "active" | "canceling" | "issue" | "ended" | "complimentary" | "other";
type LastPayment = { status: string; amount_cents: number } | null;

type Props = { tenantId: string; label: string; planId: PlanId; interval: BillingInterval | null; view: View; hasStripe: boolean; lastPayment: LastPayment };

export function SubscriptionActions({ tenantId, label, planId, interval, view, hasStripe, lastPayment }: Props) {
  const modifiable = hasStripe && (view === "active" || view === "canceling" || view === "issue");
  const refundable = hasStripe && lastPayment?.status === "paid" ? lastPayment : null;
  if (!modifiable && !refundable) return <span className="text-xs text-fg-muted">—</span>;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {modifiable ? <ChangePlan tenantId={tenantId} label={label} planId={planId} interval={interval ?? "monthly"} /> : null}
      {modifiable ? (view === "canceling" ? <KeepSubscription tenantId={tenantId} label={label} /> : <CancelSubscription tenantId={tenantId} label={label} refundable={refundable} />) : null}
      {refundable ? <RefundPayment tenantId={tenantId} label={label} amountCents={refundable.amount_cents} /> : null}
    </div>
  );
}

function ChangePlan({ tenantId, label, planId, interval }: { tenantId: string; label: string; planId: PlanId; interval: BillingInterval }) {
  const options = PLANS.filter((plan) => plan.id !== planId);
  const [plan, setPlan] = useState<PlanId>(options[0]!.id);
  const unit = interval === "yearly" ? "yr" : "mo";
  return (
    <AdminActionDialog
      triggerLabel="Change plan"
      title={`Change plan for ${label}?`}
      description={`The billing period (${interval}) and renewal day stay the same. The new price applies from the next renewal; nothing is charged or refunded now.`}
      confirmLabel="Change plan"
      onSave={(reason) => adminChangeSubscriptionPlan(tenantId, plan, reason)}
    >
      <div role="radiogroup" aria-label="New plan" className="flex flex-col gap-2">
        {options.map((option) => (
          <OptionCard key={option.id} selected={plan === option.id} onSelect={() => setPlan(option.id)} title={option.name} aside={`${formatPlanPrice(option.prices[interval].amountCents)}/${unit}`} />
        ))}
      </div>
    </AdminActionDialog>
  );
}

function CancelSubscription({ tenantId, label, refundable }: { tenantId: string; label: string; refundable: LastPayment }) {
  const [mode, setMode] = useState<"period_end" | "now">("period_end");
  const [refund, setRefund] = useState(false);
  return (
    <AdminActionDialog
      triggerLabel="Cancel"
      triggerVariant="danger-ghost"
      title={`Cancel ${label}'s subscription?`}
      description="Stripe stops charging this business. An immediate cancellation can't be undone; they would have to subscribe again."
      confirmLabel={mode === "now" ? "Cancel now" : "Cancel at period end"}
      confirmVariant="destructive"
      onSave={(reason) => adminCancelSubscription(tenantId, { mode, refund: refundable ? refund : false }, reason)}
    >
      <div role="radiogroup" aria-label="When should it end" className="flex flex-col gap-2">
        <OptionCard selected={mode === "period_end"} onSelect={() => setMode("period_end")} title="At the end of the current period" text="They keep access until the paid period ends. Recommended." />
        <OptionCard selected={mode === "now"} onSelect={() => setMode("now")} title="Immediately" text="Access ends right now." />
      </div>
      {refundable ? (
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface p-3 text-sm">
          <input type="checkbox" checked={refund} onChange={(event) => setRefund(event.target.checked)} className="mt-0.5 size-4 accent-black" />
          <span>
            <span className="block font-medium text-fg">Also refund the last payment ({formatPlanPrice(refundable.amount_cents)})</span>
            <span className="mt-0.5 block text-xs text-fg-muted">The money goes back to their card and stops counting in the statistics.</span>
          </span>
        </label>
      ) : null}
    </AdminActionDialog>
  );
}

function KeepSubscription({ tenantId, label }: { tenantId: string; label: string }) {
  return (
    <AdminActionDialog
      triggerLabel="Keep"
      title={`Keep ${label}'s subscription?`}
      description="The scheduled cancellation is removed and the subscription renews as usual."
      confirmLabel="Keep subscription"
      onSave={(reason) => adminKeepSubscription(tenantId, reason)}
    />
  );
}

function RefundPayment({ tenantId, label, amountCents }: { tenantId: string; label: string; amountCents: number }) {
  return (
    <AdminActionDialog
      triggerLabel="Refund"
      triggerVariant="danger-ghost"
      title={`Refund ${label}?`}
      description={`Returns ${formatPlanPrice(amountCents)} to their card through Stripe. The subscription isn't canceled. This can't be undone.`}
      confirmLabel={`Refund ${formatPlanPrice(amountCents)}`}
      confirmVariant="destructive"
      onSave={(reason) => adminRefundLastPayment(tenantId, reason)}
    />
  );
}

/** Fecha por defecto del plan de cortesía: dentro de 30 días (AAAA-MM-DD). */
function defaultUntil(): string {
  return new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
}

/** Asigna cualquier plan como acceso de cortesía (sin cobro) hasta una fecha. */
export function AssignPlan({ tenantId, label, currentPlanId, currentUntil }: { tenantId: string; label: string; currentPlanId: PlanId | null; currentUntil: string | null }) {
  const [plan, setPlan] = useState<PlanId>(currentPlanId ?? "pro");
  const [until, setUntil] = useState<string>(currentUntil ? currentUntil.slice(0, 10) : defaultUntil());
  const today = new Date().toISOString().slice(0, 10);
  return (
    <AdminActionDialog
      triggerLabel={currentUntil ? "Change access" : "Assign plan"}
      triggerVariant="default"
      title={`Assign a plan to ${label}?`}
      description="Complimentary access: no charge. It unlocks the bot, the team and orders with the limits of the plan until the date you choose."
      confirmLabel="Assign plan"
      disabled={!until}
      onSave={(reason) => adminAssignPlan(tenantId, { plan, until }, reason)}
    >
      <div role="radiogroup" aria-label="Plan" className="flex flex-col gap-2">
        {PLANS.map((option) => (
          <OptionCard
            key={option.id}
            selected={plan === option.id}
            onSelect={() => setPlan(option.id)}
            title={option.name}
            text={`${option.maxUsers ? `${option.maxUsers} team members` : "Unlimited team"} · ${option.maxOrdersPerMonth ? `${option.maxOrdersPerMonth.toLocaleString("en-US")} orders/month` : "unlimited orders"}`}
          />
        ))}
      </div>
      <label className="flex flex-col gap-1.5 text-xs font-medium text-fg">
        Access until (last day included)
        <input type="date" value={until} min={today} onChange={(event) => setUntil(event.target.value)} className="h-10 rounded-lg border border-border bg-surface px-3 text-sm font-normal outline-none focus:border-black" />
      </label>
    </AdminActionDialog>
  );
}

export function RemoveAssignedPlan({ tenantId, label, planId }: { tenantId: string; label: string; planId: PlanId }) {
  return (
    <AdminActionDialog
      triggerLabel="Remove access"
      triggerVariant="danger-ghost"
      title={`Remove ${label}'s complimentary access?`}
      description="The business loses access to the bot, its team and orders until it subscribes."
      confirmLabel="Remove access"
      confirmVariant="destructive"
      onSave={(reason) => adminRemoveAssignedPlan(tenantId, planId, reason)}
    />
  );
}

/** Botón del encabezado: sincroniza con Stripe (útil si el webhook no está activo). */
export function SyncButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await adminSyncSubscriptions();
          if (result.ok) notify.success(result.message ?? "Synced");
          else notify.error(result.error);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
      Sync with Stripe
    </Button>
  );
}
