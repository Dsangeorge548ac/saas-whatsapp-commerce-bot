/**
 * Validaciones (Zod) de la gestión de usuarios de plataforma: filtros de la lista (en la URL) y entradas
 * de las Server Actions. Los límites coinciden con las funciones admin_* de la base.
 */
import { z } from "zod";
import { nameSchema } from "@/features/auth/schemas";

export const USERS_PAGE_SIZE = 20;
export const USER_FILTERS = ["all", "staff", "owners", "operators", "disabled"] as const;

export const userListParamsSchema = z.object({
  q: z.string().trim().max(80).catch(""),
  filter: z.enum(USER_FILTERS).catch("all"),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});
export type UserListParams = z.infer<typeof userListParamsSchema>;

export const userIdSchema = z.uuid();
export const adminNameSchema = z.object({ firstName: nameSchema, lastName: nameSchema });
export type AdminNameInput = z.infer<typeof adminNameSchema>;
/** "none" quita el rol de plataforma. */
export const platformRoleSchema = z.enum(["developer", "platform_admin", "none"]);

export const FILTER_LABEL: Record<(typeof USER_FILTERS)[number], string> = {
  all: "All", staff: "Platform team", owners: "Owners", operators: "Operators", disabled: "Disabled",
};

/** Motivo de las acciones del staff (queda en la auditoría). */
export const reasonSchema = z.string().trim().min(3, "Write a reason (at least 3 characters).").max(300, "Use 300 characters or fewer.");

/** Datos de la cuenta que edita el developer. */
export const adminAccountSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.").max(254)),
  emailConfirmed: z.boolean(),
});
export type AdminAccountInput = z.infer<typeof adminAccountSchema>;

/** Comercio: nombre (2–120, igual que la base) y estado. */
export const adminTenantSchema = z.object({
  name: z.string().trim().min(2, "Enter the business name.").max(120, "Use 120 characters or fewer."),
  status: z.enum(["active", "suspended"]),
});
export type AdminTenantInput = z.infer<typeof adminTenantSchema>;

export const planIdSchema = z.enum(["starter", "pro", "business"]);

/** Plan de cortesía: plan y fecha límite (AAAA-MM-DD, futura, máx. 5 años; la base lo vuelve a validar). */
export const assignPlanSchema = z.object({
  plan: planIdSchema,
  until: z.iso.date("Choose a valid date."),
});

export const cancelSubscriptionSchema = z.object({ mode: z.enum(["period_end", "now"]), refund: z.boolean() });

export const SUBSCRIPTION_VIEWS = ["active", "canceling", "issue", "ended", "complimentary"] as const;
export type SubscriptionView = (typeof SUBSCRIPTION_VIEWS)[number] | "other";

export const subscriptionListParamsSchema = z.object({
  q: z.string().trim().max(80).catch(""),
  status: z.enum(["all", ...SUBSCRIPTION_VIEWS]).catch("all"),
  plan: z.enum(["all", "starter", "pro", "business"]).catch("all"),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});
export type SubscriptionListParams = z.infer<typeof subscriptionListParamsSchema>;

/** Un solo estado "visible" por suscripción (función pura). La cortesía vigente gana sobre lo demás. */
export function subscriptionView(status: string, cancelAtPeriodEnd: boolean, compUntil: string | null, now: Date = new Date()): SubscriptionView {
  if (status === "active" || status === "trialing") return cancelAtPeriodEnd ? "canceling" : "active";
  if (compUntil && new Date(compUntil) > now) return "complimentary";
  if (status === "past_due" || status === "unpaid") return "issue";
  if (status === "canceled" || status === "incomplete_expired") return "ended";
  return "other";
}
