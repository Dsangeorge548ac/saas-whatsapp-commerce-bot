/**
 * Compuerta de las Server Actions y páginas del STAFF de plataforma.
 *
 * `getStaffContext()` exige rol de plataforma (developer o platform_admin) leído del workspace (sesión verificada
 * con getClaims). `getDeveloperContext()` exige developer: las acciones que modifican cuentas. Devuelve el
 * cliente con la sesión del usuario; las funciones de la base (admin_*) vuelven a exigir el rol por dentro.
 * Los layouts no protegen las acciones: cada acción llama a una de estas funciones.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/data/workspace";

export type StaffContext = { supabase: Awaited<ReturnType<typeof createClient>>; userId: string; role: "developer" | "platform_admin" };

export async function getStaffContext(): Promise<StaffContext | null> {
  const workspace = await getWorkspace();
  if (!workspace?.platform_role) return null;
  return { supabase: await createClient(), userId: workspace.user.id, role: workspace.platform_role };
}

export async function getDeveloperContext(): Promise<StaffContext | null> {
  const staff = await getStaffContext();
  return staff?.role === "developer" ? staff : null;
}
