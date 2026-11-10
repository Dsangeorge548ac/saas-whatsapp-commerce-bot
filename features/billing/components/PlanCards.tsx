"use client";
/**
 * Tarjetas de planes (mismo diseño que Tax Pro):
 *   - Selector Monthly / Yearly arriba, en píldora (el activo con el color de acento). El anual cuesta 17% menos
 *     que 12 meses; la franja de cada card lo indica y se muestra el equivalente por mes.
 *   - Fondo gris con las tres cards del MISMO tamaño. Cada una tiene un marco de color con una franja de texto
 *     arriba (gris; el plan destacado, Pro, en el color de acento) y dentro una card blanca.
 *   - Icono en cuadro negro + nombre, precio grande con "/mo", descripción, beneficios separados por una línea
 *     y el botón siempre abajo, a la misma altura en las tres.
 *   - "Subscribe" abre Stripe Checkout. Con un plan vigente, la card actual dice "Current plan" y cambiar o
 *     cancelar se hace desde el portal de Stripe ("Manage billing").
 * Los límites mostrados son los mismos que impone la base de datos (usuarios y pedidos por mes).
 */
import { useState } from "react";
import { BadgeCheck, Briefcase, Check, Rocket, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubscribeButton } from "@/features/billing/components/BillingButtons";
import { formatPlanPrice, PLANS, YEARLY_DISCOUNT, type BillingInterval, type PlanDefinition, type PlanId } from "@/lib/stripe/plans";
import { cn } from "@/lib/utils";

const ICONS: Record<PlanId, React.ReactNode> = {
  starter: <Store className="size-4" aria-hidden />,
  pro: <Rocket className="size-4" aria-hidden />,
  business: <Briefcase className="size-4" aria-hidden />,
};

const BANDS: Record<PlanId, string> = {
  starter: "Great to start",
  pro: "Most popular",
  business: "No limits",
};

function featuresOf(plan: PlanDefinition): string[] {
  return [
    plan.maxUsers ? `Up to ${plan.maxUsers} team members` : "Unlimited team members",
    plan.maxOrdersPerMonth ? `Up to ${plan.maxOrdersPerMonth.toLocaleString("en-US")} orders / month` : "Unlimited orders",
    "WhatsApp bot with menus and catalogs",
    "Kanban board and payment proof review",
    "Chats with your customers",
    "Public store page",
  ];
}

const SAVE_PERCENT = Math.round(YEARLY_DISCOUNT * 100);

export function PlanCards({ currentPlanId, canSubscribe }: { currentPlanId: string | null; canSubscribe: boolean }) {
  const [interval, setInterval] = useState<BillingInterval>("yearly");
  const yearly = interval === "yearly";
  return (
    <div className="flex flex-col items-center gap-8 rounded-lg bg-canvas px-4 py-8 sm:px-8">
      <IntervalToggle value={interval} onChange={setInterval} />

      {/* Las tres cards tienen el mismo marco (franja + card) y el mismo alto. */}
      <ul className="grid w-full gap-5 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const highlighted = plan.id === "pro";
          const current = currentPlanId === plan.id;
          const price = plan.prices[interval];
          const band = current ? "Your current plan" : yearly ? (highlighted ? `Most popular · Save ${SAVE_PERCENT}%` : `Save ${SAVE_PERCENT}% yearly`) : BANDS[plan.id];
          return (
            <li key={plan.id} className={cn("flex flex-col rounded-lg p-1", highlighted ? "bg-accent" : "bg-chart-muted")}>
              <p className={cn("py-1.5 text-center text-xs font-semibold", highlighted ? "text-accent-foreground" : "text-fg-muted")}>
                {band}
              </p>
              <article className="flex flex-1 flex-col rounded-lg bg-surface p-6 lg:min-h-[560px]">
                <h3 className="flex items-center gap-2 text-sm font-medium text-fg">
                  <span className="grid size-6 place-items-center rounded-md bg-black text-white">{ICONS[plan.id]}</span>
                  {plan.name}
                </h3>
                <p className="mt-4 text-3xl font-semibold tracking-tight text-fg">
                  {formatPlanPrice(price.amountCents)}
                  <span className="text-xl">{yearly ? "/yr" : "/mo"}</span>
                </p>
                <p className="mt-1 text-sm text-fg-muted">
                  {yearly ? `${formatPlanPrice(Math.round(price.amountCents / 12))}/mo, billed yearly` : plan.tagline}
                </p>
                {yearly ? (
                  <p className="mt-1 text-xs text-fg-muted">
                    <span className="line-through">{formatPlanPrice(plan.prices.monthly.amountCents * 12)}</span> · you save {formatPlanPrice(plan.prices.monthly.amountCents * 12 - price.amountCents)} a year
                  </p>
                ) : null}

                <ul className="mt-5 flex flex-col gap-3 border-t border-border pt-5">
                  {featuresOf(plan).map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm text-fg">
                      <Check className="mt-0.5 size-4 shrink-0 text-fg" aria-hidden />
                      {feature}
                    </li>
                  ))}
                </ul>

                {/* mt-auto: el botón siempre queda abajo, aunque una card tenga menos beneficios. */}
                <div className="mt-auto pt-8">
                  {current ? (
                    <Button variant="outline" className="h-11 w-full" disabled>Current plan</Button>
                  ) : canSubscribe ? (
                    <SubscribeButton planId={plan.id} planName={plan.name} highlighted={highlighted} interval={interval} />
                  ) : (
                    <Button variant="outline" className="h-11 w-full" disabled>Change it in Manage billing</Button>
                  )}
                </div>
              </article>
            </li>
          );
        })}
      </ul>

      <p className="flex items-center gap-1.5 text-xs text-fg-muted">
        <BadgeCheck className="size-3.5" aria-hidden /> Secure payment with Stripe. We never see your card.
      </p>
    </div>
  );
}

/** Selector Monthly / Yearly en píldora (radiogroup accesible). */
function IntervalToggle({ value, onChange }: { value: BillingInterval; onChange: (value: BillingInterval) => void }) {
  return (
    <div role="radiogroup" aria-label="Billing period" className="inline-flex rounded-full border border-border bg-surface p-1 shadow-sm">
      {(["monthly", "yearly"] as const).map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          onClick={() => onChange(option)}
          className={cn(
            "h-9 rounded-full px-5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-black",
            value === option ? "bg-accent text-accent-foreground" : "text-fg-muted hover:text-fg",
          )}
        >
          {option === "monthly" ? "Monthly" : `Yearly · save ${SAVE_PERCENT}%`}
        </button>
      ))}
    </div>
  );
}
