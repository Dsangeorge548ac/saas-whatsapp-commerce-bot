"use server";
/**
 * Server Actions de la gestión de usuarios de plataforma. SOLO el rol `developer` modifica cuentas (el
 * `platform_admin` únicamente consulta): datos de la cuenta, comercio, plan de cortesía, rol y estado. Cada acción: (1) exige developer con la sesión verificada,
 * (2) valida con Zod, (3) llama a una función de la base que vuelve a exigir el rol y que impide actuar sobre
 * uno mismo, y (4) audita con el usuario afectado (sin valores personales: solo qué cambió y el motivo).
 * Inhabilitar cierra todas las sesiones de la persona al instante y le impide volver a entrar.
 */
import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import { getDeveloperContext } from "@/lib/auth/platform";
import { adminAccountSchema, adminTenantSchema, assignPlanSchema, planIdSchema, platformRoleSchema, reasonSchema, userIdSchema } from "@/features/admin/schemas";
import type { ActionResult } from "@/features/auth/schemas";

const NOT_ALLOWED: ActionResult = { ok: false, error: "You don't have permission to do this." };

function friendly(message: string): string {
  if (message.includes("CANNOT_CHANGE_SELF")) return "You can't do this to your own account.";
  if (message.includes("NOT_FOUND")) return "That user no longer exists.";
  if (message.includes("INVALID_NAME")) return "Check the name.";
  if (message.includes("INVALID_EMAIL")) return "Enter a valid email address.";
  if (message.includes("EMAIL_TAKEN")) return "Another account already uses that email.";
  if (message.includes("INVALID_PLAN")) return "Choose a valid plan.";
  if (message.includes("INVALID_DATE")) return "Choose a date in the future, up to 5 years from today.";
  if (message.includes("HAS_STRIPE_SUBSCRIPTION")) return "This business pays a Stripe subscription. Change its plan from Subscriptions instead.";
  return "We couldn't complete that. Try again.";
}

/** Nombre, correo y verificación del correo. Cambiar el correo no pide código: el developer lo asume (auditado). */
export async function adminUpdateAccount(userId: unknown, input: unknown, reason: unknown): Promise<ActionResult> {
  const dev = await getDeveloperContext();
  const id = userIdSchema.safeParse(userId);
  const data = adminAccountSchema.safeParse(input);
  const why = reasonSchema.safeParse(reason);
  if (!dev) return NOT_ALLOWED;
  if (!id.success || !data.success) return { ok: false, error: data.success ? "Not found." : (data.error.issues[0]?.message ?? "Check the fields.") };
  if (!why.success) return { ok: false, error: why.error.issues[0]?.message ?? "Write a reason." };

  const { error } = await dev.supabase.rpc("admin_update_user", {
    p_user: id.data, p_first: data.data.firstName, p_last: data.data.lastName, p_email: data.data.email, p_email_confirmed: data.data.emailConfirmed,
  });
  if (error) return { ok: false, error: friendly(error.message) };
  await logAudit({ actorId: dev.userId, targetUserId: id.data, action: "ADMIN_USER_UPDATED", resource: "profiles", details: { fields: ["first_name", "last_name", "email", "email_confirmed"], reason: why.data } });
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Account updated." };
}

/** Nombre del comercio y estado (suspenderlo corta el acceso a todo su equipo y apaga la operación). */
export async function adminUpdateTenant(tenantId: unknown, input: unknown, reason: unknown): Promise<ActionResult> {
  const dev = await getDeveloperContext();
  const id = userIdSchema.safeParse(tenantId);
  const data = adminTenantSchema.safeParse(input);
  const why = reasonSchema.safeParse(reason);
  if (!dev) return NOT_ALLOWED;
  if (!id.success || !data.success) return { ok: false, error: data.success ? "Not found." : (data.error.issues[0]?.message ?? "Check the fields.") };
  if (!why.success) return { ok: false, error: why.error.issues[0]?.message ?? "Write a reason." };

  const { error } = await dev.supabase.rpc("admin_update_tenant", { p_tenant: id.data, p_name: data.data.name, p_status: data.data.status });
  if (error) return { ok: false, error: friendly(error.message) };
  await logAudit({ actorId: dev.userId, tenantId: id.data, action: "ADMIN_TENANT_UPDATED", resource: "tenants", details: { status: data.data.status, reason: why.data } });
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Business updated." };
}

/**
 * Asigna cualquier plan al comercio como acceso de cortesía hasta una fecha (sin cobro). Desbloquea el bot, el
 * equipo y los pedidos con los límites de ese plan. Si el comercio paga una suscripción viva en Stripe, la base lo
 * rechaza: ese plan se cambia con "Change plan" (en Stripe).
 */
export async function adminAssignPlan(tenantId: unknown, input: unknown, reason: unknown): Promise<ActionResult> {
  const dev = await getDeveloperContext();
  const id = userIdSchema.safeParse(tenantId);
  const data = assignPlanSchema.safeParse(input);
  const why = reasonSchema.safeParse(reason);
  if (!dev) return NOT_ALLOWED;
  if (!id.success || !data.success) return { ok: false, error: data.success ? "Not found." : (data.error.issues[0]?.message ?? "Check the fields.") };
  if (!why.success) return { ok: false, error: why.error.issues[0]?.message ?? "Write a reason." };

  // Fin del día elegido (UTC), para que la fecha mostrada sea el último día con acceso.
  const until = new Date(`${data.data.until}T23:59:59Z`).toISOString();
  const { error } = await dev.supabase.rpc("admin_assign_plan", { p_tenant: id.data, p_plan: data.data.plan, p_until: until });
  if (error) return { ok: false, error: friendly(error.message) };
  await logAudit({ actorId: dev.userId, tenantId: id.data, action: "ADMIN_PLAN_ASSIGNED", resource: "tenant_subscriptions", details: { plan: data.data.plan, until, reason: why.data } });
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Plan assigned." };
}

/** Quita el acceso de cortesía (el comercio vuelve a necesitar una suscripción). */
export async function adminRemoveAssignedPlan(tenantId: unknown, plan: unknown, reason: unknown): Promise<ActionResult> {
  const dev = await getDeveloperContext();
  const id = userIdSchema.safeParse(tenantId);
  const planId = planIdSchema.safeParse(plan);
  const why = reasonSchema.safeParse(reason);
  if (!dev) return NOT_ALLOWED;
  if (!id.success || !planId.success) return { ok: false, error: "Not found." };
  if (!why.success) return { ok: false, error: why.error.issues[0]?.message ?? "Write a reason." };

  const { error } = await dev.supabase.rpc("admin_assign_plan", { p_tenant: id.data, p_plan: planId.data, p_until: null as unknown as string });
  if (error) return { ok: false, error: friendly(error.message) };
  await logAudit({ actorId: dev.userId, tenantId: id.data, action: "ADMIN_PLAN_REMOVED", resource: "tenant_subscriptions", details: { reason: why.data } });
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Complimentary access removed." };
}

export async function adminSetPlatformRole(userId: unknown, role: unknown, reason: unknown): Promise<ActionResult> {
  const dev = await getDeveloperContext();
  const id = userIdSchema.safeParse(userId);
  const parsedRole = platformRoleSchema.safeParse(role);
  const why = typeof reason === "string" ? reason.trim().slice(0, 300) : "";
  if (!dev) return NOT_ALLOWED;
  if (!id.success || !parsedRole.success || why.length < 3) return { ok: false, error: "Choose a role and write a reason." };

  const { error } = await dev.supabase.rpc("admin_set_platform_role", { p_user: id.data, p_role: parsedRole.data === "none" ? (null as unknown as string) : parsedRole.data });
  if (error) return { ok: false, error: friendly(error.message) };
  await logAudit({ actorId: dev.userId, targetUserId: id.data, action: "ADMIN_PLATFORM_ROLE_CHANGED", resource: "platform_roles", details: { role: parsedRole.data, reason: why } });
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Role updated." };
}

export async function adminSetDisabled(userId: unknown, disabled: unknown, reason: unknown): Promise<ActionResult> {
  const dev = await getDeveloperContext();
  const id = userIdSchema.safeParse(userId);
  const why = typeof reason === "string" ? reason.trim().slice(0, 300) : "";
  if (!dev) return NOT_ALLOWED;
  if (!id.success || typeof disabled !== "boolean" || why.length < 3) return { ok: false, error: "Write a reason (at least 3 characters)." };

  const { error } = await dev.supabase.rpc("admin_set_user_disabled", { p_user: id.data, p_disabled: disabled });
  if (error) return { ok: false, error: friendly(error.message) };
  await logAudit({ actorId: dev.userId, targetUserId: id.data, action: disabled ? "ADMIN_USER_DISABLED" : "ADMIN_USER_ENABLED", resource: "auth", details: { reason: why } });
  revalidatePath("/admin", "layout");
  return { ok: true, message: disabled ? "Account disabled." : "Account enabled." };
}
