/**
 * Planes de la plataforma (fuente única para crear los productos y precios en Stripe).
 *
 * Cada plan tiene dos precios: mensual y anual. El anual lleva un 17% de descuento sobre 12 meses
 * (redondeado a dólares enteros). El precio real se busca en Stripe por su `lookup_key`: no hay ids de precio
 * en variables de entorno. Los límites (usuarios y pedidos por mes) que impone la base de datos salen de la
 * tabla `plans`, que se sembró con los mismos valores: si cambias algo aquí, cambia también esa tabla (y corre
 * stripe:setup). Sin imports de servidor: lo usan la interfaz y el script de configuración.
 */
export type PlanId = "starter" | "pro" | "business";
export type BillingInterval = "monthly" | "yearly";
export const BILLING_INTERVALS: BillingInterval[] = ["monthly", "yearly"];

/** Descuento del pago anual frente a 12 pagos mensuales. */
export const YEARLY_DISCOUNT = 0.17;

/** Precio anual: 12 meses con el descuento, redondeado a dólares enteros (en centavos). */
export function yearlyCents(monthlyCents: number): number {
  return Math.round((monthlyCents * 12 * (1 - YEARLY_DISCOUNT)) / 100) * 100;
}

export type PlanPrice = { amountCents: number; lookupKey: string; stripeInterval: "month" | "year" };

export type PlanDefinition = {
  id: PlanId;
  name: string;
  maxUsers: number | null;
  maxOrdersPerMonth: number | null;
  tagline: string;
  prices: Record<BillingInterval, PlanPrice>;
};

function plan(id: PlanId, name: string, monthlyCents: number, limits: { maxUsers: number | null; maxOrdersPerMonth: number | null }, tagline: string): PlanDefinition {
  return {
    id,
    name,
    ...limits,
    tagline,
    prices: {
      monthly: { amountCents: monthlyCents, lookupKey: `wabot_${id}_monthly`, stripeInterval: "month" },
      yearly: { amountCents: yearlyCents(monthlyCents), lookupKey: `wabot_${id}_yearly`, stripeInterval: "year" },
    },
  };
}

export const PLANS: PlanDefinition[] = [
  plan("starter", "Starter", 1900, { maxUsers: 2, maxOrdersPerMonth: 300 }, "For a small shop getting started"),
  plan("pro", "Pro", 4900, { maxUsers: 5, maxOrdersPerMonth: 1500 }, "For a busy shop with a team"),
  plan("business", "Business", 9900, { maxUsers: null, maxOrdersPerMonth: null }, "No limits on orders or team"),
];

export const PLAN_BY_ID = new Map(PLANS.map((p) => [p.id, p]));

/** Plan e intervalo por lookup_key (el webhook lo usa para saber qué compró el comercio). */
export const PLAN_BY_LOOKUP_KEY = new Map(
  PLANS.flatMap((p) => BILLING_INTERVALS.map((interval) => [p.prices[interval].lookupKey, p] as const)),
);
export const INTERVAL_BY_LOOKUP_KEY = new Map(
  PLANS.flatMap((p) => BILLING_INTERVALS.map((interval) => [p.prices[interval].lookupKey, interval] as const)),
);

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && PLAN_BY_ID.has(value as PlanId);
}

export function isBillingInterval(value: unknown): value is BillingInterval {
  return value === "monthly" || value === "yearly";
}

export function formatPlanPrice(priceCents: number): string {
  return `$${(priceCents / 100).toFixed(priceCents % 100 === 0 ? 0 : 2)}`;
}

/** Ingreso mensual recurrente: cada suscripción activa suma su precio; las anuales, su precio / 12. */
export function monthlyRecurringCents(groups: { plan_id: string; interval: BillingInterval; count: number }[]): number {
  return groups.reduce((sum, group) => {
    const plan = PLAN_BY_ID.get(group.plan_id as PlanId);
    if (!plan) return sum;
    const price = plan.prices[group.interval].amountCents;
    return sum + Math.round((group.interval === "yearly" ? price / 12 : price) * group.count);
  }, 0);
}
