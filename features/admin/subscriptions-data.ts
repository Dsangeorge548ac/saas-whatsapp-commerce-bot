/**
 * Consultas del panel /admin/subscriptions (funciones admin_* de la base: exigen staff de plataforma por dentro).
 * Paginación y filtros en la base; aquí se valida la respuesta con Zod y se calcula el ingreso mensual (MRR) con
 * los precios de lib/stripe/plans.ts (los planes anuales cuentan su precio / 12).
 */
import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { USERS_PAGE_SIZE, type SubscriptionListParams } from "@/features/admin/schemas";
import { monthlyRecurringCents } from "@/lib/stripe/plans";

const rowSchema = z.object({
  tenant_id: z.string(),
  tenant_name: z.string(),
  tenant_status: z.enum(["active", "suspended"]),
  plan_id: z.enum(["starter", "pro", "business"]),
  plan_name: z.string(),
  status: z.string(),
  billing_interval: z.enum(["monthly", "yearly"]).nullable(),
  activated_at: z.string().nullable(),
  current_period_end: z.string().nullable(),
  cancel_at_period_end: z.boolean(),
  canceled_at: z.string().nullable(),
  comp_access_until: z.string().nullable(),
  has_stripe: z.boolean(),
  owner_id: z.string().nullable(),
  owner_name: z.string().nullable(),
  owner_email: z.string().nullable(),
  view: z.enum(["active", "canceling", "issue", "ended", "complimentary", "other"]),
  last_payment: z.object({ status: z.enum(["pending", "paid", "failed", "refunded"]), amount_cents: z.number(), at: z.string() }).nullable(),
});
export type AdminSubscriptionRow = z.infer<typeof rowSchema>;

export async function listSubscriptions(params: SubscriptionListParams) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_subscriptions", {
    p_search: params.q, p_status: params.status, p_plan: params.plan, p_limit: USERS_PAGE_SIZE, p_offset: (params.page - 1) * USERS_PAGE_SIZE,
  });
  const parsed = z.object({ total: z.number(), rows: z.array(rowSchema) }).safeParse(data);
  if (error || !parsed.success) return { rows: [] as AdminSubscriptionRow[], total: 0, page: params.page, pageCount: 1 };
  return { rows: parsed.data.rows, total: parsed.data.total, page: params.page, pageCount: Math.max(1, Math.ceil(parsed.data.total / USERS_PAGE_SIZE)) };
}

const kpiSchema = z.object({
  active_by_plan: z.array(z.object({ plan_id: z.string(), interval: z.enum(["monthly", "yearly"]), count: z.number() })),
  renewing_soon: z.number(),
  issues: z.number(),
  ended: z.number(),
  complimentary: z.number(),
  paid_this_month_cents: z.number(),
  refunded_this_month_cents: z.number(),
});

export type SubscriptionKpis = { active: number; mrrCents: number; renewingSoon: number; issues: number; ended: number; complimentary: number; paidThisMonthCents: number; refundedThisMonthCents: number };

export async function getSubscriptionKpis(): Promise<SubscriptionKpis> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_subscription_kpis");
  const parsed = kpiSchema.safeParse(data);
  if (!parsed.success) return { active: 0, mrrCents: 0, renewingSoon: 0, issues: 0, ended: 0, complimentary: 0, paidThisMonthCents: 0, refundedThisMonthCents: 0 };
  const k = parsed.data;
  return {
    active: k.active_by_plan.reduce((sum, group) => sum + group.count, 0),
    mrrCents: monthlyRecurringCents(k.active_by_plan),
    renewingSoon: k.renewing_soon,
    issues: k.issues,
    ended: k.ended,
    complimentary: k.complimentary,
    paidThisMonthCents: k.paid_this_month_cents,
    refundedThisMonthCents: k.refunded_this_month_cents,
  };
}
