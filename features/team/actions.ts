"use server";
/**
 * Server Actions del equipo: invitar operadores, revocar invitaciones, quitar operadores y aceptar una
 * invitación. TODAS las reglas viven en funciones de la base de datos que vuelven a validar quién llama:
 *   - invite_operator: solo el dueño, con suscripción vigente y cupo en el plan (usuarios).
 *   - accept_invitation: la persona con sesión y correo verificado igual al invitado; un solo uso; vence a los 7 días.
 *   - remove_operator / revoke_invitation: solo el dueño; nunca se quita a un dueño.
 * El token de invitación se devuelve UNA sola vez (en la base solo queda su hash SHA-256). No hay envío de
 * correo: el dueño copia el enlace y se lo manda al operador.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getOwnerContext } from "@/lib/auth/owner";
import { publicEnv } from "@/lib/env";
import { inviteTokenSchema } from "@/features/auth/schemas";
import { createClient } from "@/lib/supabase/server";

export type TeamResult = { ok: true; link?: string } | { ok: false; error: string };
const NOT_FOUND: TeamResult = { ok: false, error: "Not found." };

function friendly(message: string): string {
  if (message.includes("SUBSCRIPTION_REQUIRED")) return "The business needs an active plan for this. Choose a plan in Billing first.";
  if (message.includes("USER_LIMIT_REACHED")) return "Your plan's team limit is reached. Upgrade your plan to add more people.";
  if (message.includes("Already a member")) return "That person is already on your team.";
  if (message.includes("Invalid email")) return "Enter a valid email address.";
  if (message.includes("Invalid or expired")) return "This invitation is invalid, expired or was already used. Ask the owner for a new one.";
  return "We couldn't complete that. Please try again.";
}

export async function inviteOperator(email: unknown): Promise<TeamResult> {
  const owner = await getOwnerContext();
  const parsed = z.string().trim().toLowerCase().pipe(z.email().max(254)).safeParse(email);
  if (!owner) return NOT_FOUND;
  if (!parsed.success) return { ok: false, error: "Enter a valid email address." };

  const { data: token, error } = await owner.supabase.rpc("invite_operator", { p_tenant: owner.tenantId, p_email: parsed.data });
  if (error || !token) return { ok: false, error: friendly(error?.message ?? "") };
  revalidatePath("/settings/team");
  return { ok: true, link: `${publicEnv.NEXT_PUBLIC_APP_URL}/join?token=${token}` };
}

export async function revokeInvitation(id: unknown): Promise<TeamResult> {
  const owner = await getOwnerContext();
  const parsed = z.uuid().safeParse(id);
  if (!owner || !parsed.success) return NOT_FOUND;
  const { error } = await owner.supabase.rpc("revoke_invitation", { p_invitation: parsed.data });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath("/settings/team");
  return { ok: true };
}

export async function removeOperator(userId: unknown): Promise<TeamResult> {
  const owner = await getOwnerContext();
  const parsed = z.uuid().safeParse(userId);
  if (!owner || !parsed.success) return NOT_FOUND;
  const { error } = await owner.supabase.rpc("remove_operator", { p_tenant: owner.tenantId, p_user: parsed.data });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath("/settings/team");
  return { ok: true };
}

/** El invitado (con sesión) acepta con el enlace. Si todo sale bien va al panel. */
export async function acceptInvitation(token: unknown): Promise<TeamResult> {
  const parsed = inviteTokenSchema.safeParse(token);
  if (!parsed.success) return { ok: false, error: friendly("Invalid or expired") };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NOT_FOUND;

  const { error } = await supabase.rpc("accept_invitation", { p_token: parsed.data });
  if (error) return { ok: false, error: friendly(error.message) };
  redirect("/dashboard");
}

/**
 * El enlace de invitación se abrió con OTRA cuenta abierta (p. ej. la del dueño que invitó): se cierra esa sesión
 * en este navegador y se vuelve al enlace para que la persona invitada cree su cuenta o entre con la suya.
 */
export async function signOutToJoin(token: unknown): Promise<void> {
  const parsed = inviteTokenSchema.safeParse(token);
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect(parsed.success ? `/join?token=${parsed.data}` : "/login");
}
