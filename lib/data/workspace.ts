/**
 * Estado del área privada en UNA llamada (get_my_workspace) y compuertas de acceso.
 *
 * Qué devuelve: usuario, rol de plataforma (developer / platform_admin), comercios de los que es
 * miembro (con su rol, estado y si la suscripción está vigente) y notificaciones sin leer.
 * Por qué una sola llamada: cada viaje a Supabase cuesta ~150-300 ms; `cache()` la memoriza durante
 * la petición para que layouts y páginas no la repitan.
 * Seguridad: la identidad sale de getClaims() (JWT verificado), nunca de getSession(); lo que se
 * lee pasa por RLS con el JWT del usuario. Los layouts NO protegen las Server Actions: cada acción
 * vuelve a comprobar sesión, rol y comercio.
 */
import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const membershipSchema = z.object({
  tenant_id: z.string(),
  name: z.string(),
  slug: z.string(),
  role: z.enum(["owner", "operator"]),
  status: z.enum(["active", "suspended"]),
  billable: z.boolean(),
});

const workspaceSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string(),
    first_name: z.string(),
    last_name: z.string(),
    avatar_path: z.string().nullable().optional(),
  }),
  platform_role: z.enum(["developer", "platform_admin"]).nullable(),
  memberships: z.array(membershipSchema),
  unread_notifications: z.number(),
});

export type Workspace = z.infer<typeof workspaceSchema>;
export type Membership = z.infer<typeof membershipSchema>;

/** Workspace del usuario con sesión, o null si no hay sesión válida. */
export const getWorkspace = cache(async (): Promise<Workspace | null> => {
  await connection(); // Depende de la sesión: solo en tiempo de petición.
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return null;

  const { data, error } = await supabase.rpc("get_my_workspace");
  if (error) return null;
  const parsed = workspaceSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
});

/** Para páginas y layouts: sin sesión → /login. */
export async function requireWorkspace(): Promise<Workspace> {
  const workspace = await getWorkspace();
  if (!workspace) redirect("/login");
  return workspace;
}

/** Comercio activo del usuario (por ahora el primero; el selector de comercios llega después). */
export function currentMembership(workspace: Workspace): Membership | null {
  return workspace.memberships[0] ?? null;
}
