"use server";
/**
 * Server Actions del perfil propio (cualquier usuario con sesión: dueño, operador o staff de plataforma;
 * no exigen suscripción porque es la cuenta de la persona, no una función del comercio).
 *
 *   - updateMyName: nombre y apellido, con el cliente del USUARIO (RLS + GRANT por columna: solo su fila y
 *     solo esas dos columnas).
 *   - changeMyPassword: pide la contraseña ACTUAL (re-autenticación) antes de aplicar la nueva (12+).
 *   - requestEmailChange / confirmEmailChange: también piden la contraseña actual; el correo nuevo se confirma
 *     con un código de 6 dígitos enviado a ESE correo (hasta entonces se sigue usando el anterior).
 *   - signOutOtherDevices: cierra las demás sesiones.
 *   - setMyAvatar: guarda o quita la foto de perfil (ya subida por el navegador a su carpeta privada).
 * Seguridad: Zod en cada acción, sesión verificada con getClaims, límite de intentos propio (anti fuerza bruta
 * de la contraseña actual) y auditoría sin valores (solo qué campos cambiaron). Nunca se registran contraseñas.
 */
import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import { clearAttempts, takeAttempt } from "@/lib/auth/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { isOwnAvatarPath } from "@/lib/files/avatar";
import { authErrorMessage } from "@/features/auth/errors";
import type { ActionResult } from "@/features/auth/schemas";
import { changeEmailSchema, changePasswordSchema, confirmEmailSchema, profileNameSchema } from "@/features/profile/schemas";

const NO_SESSION: ActionResult = { ok: false, error: "Your session expired. Log in again." };

/** Usuario con sesión verificada (JWT) y su cliente de Supabase; null si no hay sesión. */
async function currentUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  const email = typeof data?.claims?.email === "string" ? data.claims.email : null;
  return id && email ? { supabase, id, email } : null;
}

/** Re-autentica con la contraseña actual (límite de intentos incluido). Devuelve un mensaje si falla. */
async function verifyCurrentPassword(user: NonNullable<Awaited<ReturnType<typeof currentUser>>>, password: string): Promise<string | null> {
  const blocked = await takeAttempt(["profileSecurity", user.id]);
  if (blocked) return blocked;
  const { error } = await user.supabase.auth.signInWithPassword({ email: user.email, password });
  if (error) return "Your current password is incorrect.";
  await clearAttempts("profileSecurity", user.id);
  return null;
}

export async function updateMyName(input: unknown): Promise<ActionResult> {
  const user = await currentUser();
  if (!user) return NO_SESSION;
  const parsed = profileNameSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check your first and last name." };

  const { error } = await user.supabase.from("profiles").update({ first_name: parsed.data.firstName, last_name: parsed.data.lastName }).eq("id", user.id);
  if (error) return { ok: false, error: "We couldn't save your name. Try again." };
  await logAudit({ actorId: user.id, action: "PROFILE_UPDATED", resource: "profiles", details: { fields: ["first_name", "last_name"] } });
  revalidatePath("/", "layout");
  return { ok: true, message: "Name updated." };
}

export async function changeMyPassword(input: unknown): Promise<ActionResult> {
  const user = await currentUser();
  if (!user) return NO_SESSION;
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Use at least 12 characters for the new password." };
  if (parsed.data.newPassword === parsed.data.currentPassword) return { ok: false, error: "Choose a different password." };

  const failed = await verifyCurrentPassword(user, parsed.data.currentPassword);
  if (failed) return { ok: false, error: failed };

  const { error } = await user.supabase.auth.updateUser({ password: parsed.data.newPassword });
  if (error) return { ok: false, error: authErrorMessage(error, "We couldn't change your password. Try again.") };
  await logAudit({ actorId: user.id, action: "PASSWORD_CHANGED", resource: "auth" });
  return { ok: true, message: "Password changed." };
}

export async function requestEmailChange(input: unknown): Promise<ActionResult> {
  const user = await currentUser();
  if (!user) return NO_SESSION;
  const parsed = changeEmailSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the email and password." };
  if (parsed.data.newEmail === user.email.toLowerCase()) return { ok: false, error: "That is already your email." };

  const failed = await verifyCurrentPassword(user, parsed.data.currentPassword);
  if (failed) return { ok: false, error: failed };

  const { error } = await user.supabase.auth.updateUser({ email: parsed.data.newEmail });
  if (error) return { ok: false, error: authErrorMessage(error, "We couldn't send the code. Try again in a minute.") };
  return { ok: true, message: "We sent a 6-digit code to the new email." };
}

export async function confirmEmailChange(input: unknown): Promise<ActionResult> {
  const user = await currentUser();
  if (!user) return NO_SESSION;
  const parsed = confirmEmailSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter the 6-digit code." };

  // Anti fuerza bruta del código de 6 dígitos.
  const blocked = await takeAttempt(["otp", `emailchange:${user.id}`]);
  if (blocked) return { ok: false, error: blocked };

  const { error } = await user.supabase.auth.verifyOtp({ email: parsed.data.newEmail, token: parsed.data.code, type: "email_change" });
  if (error) return { ok: false, error: authErrorMessage(error, "This code is invalid or has expired. Request a new one.") };
  await clearAttempts("otp", `emailchange:${user.id}`);
  await logAudit({ actorId: user.id, action: "EMAIL_CHANGED", resource: "auth" });
  revalidatePath("/", "layout");
  return { ok: true, message: "Email updated." };
}

export async function signOutOtherDevices(): Promise<ActionResult> {
  const user = await currentUser();
  if (!user) return NO_SESSION;
  const { error } = await user.supabase.auth.signOut({ scope: "others" });
  if (error) return { ok: false, error: "We couldn't sign out your other devices. Try again." };
  await logAudit({ actorId: user.id, action: "SESSIONS_REVOKED", resource: "auth" });
  return { ok: true, message: "Signed out of all other devices." };
}

/**
 * Foto de perfil: el navegador ya la subió a avatars/{uid}/avatar-{uuid}.ext (la política de Storage solo deja
 * subir a la carpeta propia). Aquí se valida que la ruta sea de ESTE usuario, se guarda (o se quita con null) y
 * se borra la foto anterior. La base vuelve a exigir con un CHECK que la ruta esté en la carpeta del dueño.
 */
export async function setMyAvatar(path: unknown): Promise<ActionResult> {
  const user = await currentUser();
  if (!user) return NO_SESSION;
  if (path !== null && (typeof path !== "string" || !isOwnAvatarPath(path, user.id))) return { ok: false, error: "We couldn't save your photo. Try again." };

  const { data: before } = await user.supabase.from("profiles").select("avatar_path").eq("id", user.id).maybeSingle();
  const { error } = await user.supabase.from("profiles").update({ avatar_path: path }).eq("id", user.id);
  if (error) return { ok: false, error: "We couldn't save your photo. Try again." };

  // La foto anterior ya no se usa: se borra (con la sesión del usuario; la política solo permite su carpeta).
  if (before?.avatar_path && before.avatar_path !== path) await user.supabase.storage.from("avatars").remove([before.avatar_path]);
  await logAudit({ actorId: user.id, action: "PROFILE_UPDATED", resource: "profiles", details: { fields: [path ? "avatar" : "avatar_removed"] } });
  revalidatePath("/", "layout");
  return { ok: true, message: path ? "Photo updated." : "Photo removed." };
}
