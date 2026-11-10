/**
 * Compuerta de las Server Actions que solo puede ejecutar el DUEÑO del comercio.
 *
 * Qué hace: lee el workspace (sesión verificada con getClaims, una sola llamada por petición) y exige ser
 * `owner` del comercio activo. Devuelve el cliente de Supabase CON la sesión del usuario: las escrituras
 * pasan por RLS, que vuelve a exigir "dueño del comercio" (doble barrera; la service role no se usa aquí).
 * Los layouts no protegen las acciones: cada acción llama a esta función.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { currentMembership, getWorkspace } from "@/lib/data/workspace";

export type OwnerContext = { supabase: Awaited<ReturnType<typeof createClient>>; tenantId: string; userId: string; slug: string };

/** Devuelve el contexto del dueño, o null (la acción responde "Not found" sin revelar nada más). */
export async function getOwnerContext(): Promise<OwnerContext | null> {
  const workspace = await getWorkspace();
  const membership = workspace ? currentMembership(workspace) : null;
  if (!workspace || !membership || membership.role !== "owner" || membership.status !== "active") return null;
  return { supabase: await createClient(), tenantId: membership.tenant_id, userId: workspace.user.id, slug: membership.slug };
}
