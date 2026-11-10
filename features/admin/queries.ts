/**
 * Consultas de la gestión de usuarios (funciones admin_* de la base: validan el rol de plataforma por dentro).
 * Devuelven solo datos de cuentas, nunca datos de clientes finales. Paginación y filtros en el servidor.
 */
import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { USERS_PAGE_SIZE, type UserListParams } from "@/features/admin/schemas";

const roleSchema = z.enum(["developer", "platform_admin"]).nullable();
const tenantRoleSchema = z.enum(["owner", "operator"]).nullable();

const rowSchema = z.object({
  id: z.string(),
  email: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  created_at: z.string(),
  avatar_path: z.string().nullable(),
  platform_role: roleSchema,
  tenant_name: z.string().nullable(),
  tenant_role: tenantRoleSchema,
  disabled: z.boolean(),
});
export type UserRow = z.infer<typeof rowSchema>;

const detailSchema = rowSchema.extend({
  tenant_id: z.string().nullable(),
  tenant_slug: z.string().nullable(),
  tenant_status: z.enum(["active", "suspended"]).nullable(),
  member_since: z.string().nullable(),
  plan_id: z.string().nullable(),
  plan_name: z.string().nullable(),
  subscription_status: z.string().nullable(),
  billing_interval: z.enum(["monthly", "yearly"]).nullable(),
  has_stripe_subscription: z.boolean(),
  cancel_at_period_end: z.boolean(),
  current_period_end: z.string().nullable(),
  comp_access_until: z.string().nullable(),
  email_confirmed: z.boolean(),
  last_sign_in_at: z.string().nullable(),
});
export type UserDetail = z.infer<typeof detailSchema>;

export async function listUsers(params: UserListParams) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_users", {
    p_search: params.q, p_filter: params.filter, p_limit: USERS_PAGE_SIZE, p_offset: (params.page - 1) * USERS_PAGE_SIZE,
  });
  const parsed = z.object({ total: z.number(), rows: z.array(rowSchema) }).safeParse(data);
  if (error || !parsed.success) return { rows: [] as UserRow[], total: 0, page: params.page, pageCount: 1 };
  return { rows: parsed.data.rows, total: parsed.data.total, page: params.page, pageCount: Math.max(1, Math.ceil(parsed.data.total / USERS_PAGE_SIZE)) };
}

export async function getUserDetail(id: string): Promise<UserDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_get_user", { p_user: id });
  const parsed = detailSchema.safeParse(data);
  return error || !parsed.success ? null : parsed.data;
}

export const ACTIVITY_PAGE_SIZE = 10;

export type ActivityEvent = { id: string; action: string; resource: string; byUser: boolean; ip: string | null; details: unknown; createdAt: string };

/**
 * Actividad del usuario: eventos de auditoría donde fue el autor o el afectado (RLS: solo el staff los lee
 * todos). Paginado en el servidor. `details` nunca lleva teléfonos completos ni tokens (regla de logAudit).
 */
export async function getUserActivity(userId: string, page: number) {
  const supabase = await createClient();
  const from = (page - 1) * ACTIVITY_PAGE_SIZE;
  const { data, count } = await supabase
    .from("audit_logs")
    .select("id, actor_id, action, resource, ip_address, details, created_at", { count: "exact" })
    .or(`actor_id.eq.${userId},target_user_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .range(from, from + ACTIVITY_PAGE_SIZE - 1);
  const total = count ?? 0;
  const events: ActivityEvent[] = (data ?? []).map((row) => ({
    id: String(row.id), action: row.action, resource: row.resource, byUser: row.actor_id === userId,
    ip: row.ip_address ? String(row.ip_address) : null, details: row.details, createdAt: row.created_at,
  }));
  return { events, total, page, pageCount: Math.max(1, Math.ceil(total / ACTIVITY_PAGE_SIZE)) };
}
