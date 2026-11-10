/**
 * Compuerta de las Server Actions que puede ejecutar el equipo que OPERA el comercio (dueño u operador).
 *
 * Qué hace: lee el workspace (sesión verificada con getClaims, una llamada por petición) y exige ser
 * miembro de un comercio activo con la suscripción vigente. Devuelve el cliente de Supabase CON la sesión
 * del usuario: las funciones de la base (advance_order, review_proof…) vuelven a validar quién llama,
 * el estado y la suscripción (doble barrera). Los layouts no protegen las acciones.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { currentMembership, getWorkspace } from "@/lib/data/workspace";

export type OperatorContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  tenantId: string;
  userId: string;
  role: "owner" | "operator";
};

export async function getOperatorContext(): Promise<OperatorContext | null> {
  const workspace = await getWorkspace();
  const membership = workspace ? currentMembership(workspace) : null;
  if (!workspace || !membership || membership.status !== "active" || !membership.billable) return null;
  return { supabase: await createClient(), tenantId: membership.tenant_id, userId: workspace.user.id, role: membership.role };
}
