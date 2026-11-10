"use server";
/**
 * Server Actions de sesión: registro, inicio de sesión y cierre de sesión.
 *
 * Patrón de todas las acciones:
 *   1. Validar la entrada con Zod (el navegador se puede saltar la validación del formulario).
 *   2. Limitar intentos (anti fuerza bruta) antes de tocar Supabase Auth.
 *   3. Si todo sale bien → redirect(); si no → { ok: false, error } con un mensaje genérico.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { safeNextPath } from "@/lib/auth/redirects";
import { setPendingEmail } from "@/lib/auth/pending-signup";
import { clearAttempts, getClientIp, takeAttempt } from "@/lib/auth/rate-limit";
import { ensureTenantFromSignup } from "@/lib/auth/tenant";
import { getInvitationPreview } from "@/lib/auth/invitation";
import { getWorkspace } from "@/lib/data/workspace";
import { authErrorMessage } from "@/features/auth/errors";
import { inviteRegisterSchema, loginSchema, registerSchema, type ActionResult } from "@/features/auth/schemas";

/**
 * Decide a dónde va el usuario recién autenticado.
 * Sin comercio todavía (registro sin terminar) → se crea con los datos del registro.
 * Comercio suspendido → /account-disabled. Si no, a la ruta pedida (validada).
 */
async function destinationAfterSignIn(next: string): Promise<string> {
  const supabase = await createClient();
  await ensureTenantFromSignup(supabase);
  const workspace = await getWorkspace();
  if (!workspace) return "/login";

  const isPlatformStaff = workspace.platform_role !== null;
  const memberships = workspace.memberships;
  // Todos sus comercios suspendidos (y no es personal de la plataforma): no entra.
  if (!isPlatformStaff && memberships.length > 0 && memberships.every((m) => m.status === "suspended")) {
    await supabase.auth.signOut({ scope: "local" });
    return "/account-disabled";
  }
  return safeNextPath(next);
}

/** Registro (RegisterForm). Crea la cuenta y manda el código de 6 dígitos al email. */
export async function signUp(input: unknown): Promise<ActionResult> {
  // Dos formas de registrarse: dueño (con datos del comercio) u operador invitado (con el token de invitación).
  const owner = registerSchema.safeParse(input);
  const invited = owner.success ? null : inviteRegisterSchema.safeParse(input);
  if (!owner.success && !invited?.success) return { ok: false, error: "Check the highlighted fields and try again." };
  const { password, firstName, lastName } = (owner.success ? owner.data : invited?.data)!;
  let email = (owner.success ? owner.data : invited?.data)!.email;
  // Invitado: el correo es el de la invitación (lo que llegue del navegador no cuenta). Así el código de
  // verificación siempre le llega a la persona invitada y no a quien tenga la sesión abierta en ese navegador.
  if (invited?.success) {
    const preview = await getInvitationPreview(invited.data.inviteToken);
    if (!preview) return { ok: false, error: "This invitation isn't valid anymore. Ask the business owner for a new link." };
    email = preview.email.toLowerCase();
  }
  const signupData = owner.success
    ? { first_name: firstName, last_name: lastName, business_name: owner.data.businessName, business_type: owner.data.businessType }
    : { first_name: firstName, last_name: lastName, invite_token: invited?.data?.inviteToken ?? "" };

  // Anti abuso: máximo de cuentas nuevas por IP y por hora.
  const blocked = await takeAttempt(["signUpIp", await getClientIp()]);
  if (blocked) return { ok: false, error: blocked };

  const supabase = await createClient();
  // Si en este navegador había otra sesión abierta (p. ej. la del dueño que invitó), se cierra aquí: la cuenta
  // nueva no debe mezclarse con ella.
  const { data: current } = await supabase.auth.getClaims();
  if (current?.claims?.sub) await supabase.auth.signOut({ scope: "local" });

  const { error } = await supabase.auth.signUp({
    email,
    password,
    // Solo datos de perfil y de alta del comercio: el trigger handle_new_user copia el nombre a
    // profiles y create_tenant() usa el resto DESPUÉS de verificar el correo.
    // Nunca permisos: los roles los pone la base de datos.
    options: { data: signupData },
  });

  if (error) {
    // Un 500 al registrarse casi siempre significa que el correo con el código no se pudo
    // enviar (SMTP caído o mal configurado). Supabase deshace el registro, así que se puede
    // reintentar. Mensaje genérico: no se revelan detalles del proveedor de correo.
    if (error.status === 500) {
      return { ok: false, error: "We couldn't send your verification email. Please try again in a few minutes." };
    }
    return { ok: false, error: authErrorMessage(error, "We couldn't create your account. Check your details and try again.") };
  }

  // Si el email ya existía, Supabase responde igual que si fuera nuevo (no revela cuentas);
  // el usuario simplemente no recibirá código. Por eso la pantalla siguiente es genérica.
  await setPendingEmail(email);
  redirect("/verify");
}

/** Inicio de sesión (LoginForm). */
export async function signIn(input: unknown, next: string | null): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid email or password." };

  // Anti fuerza bruta: 5 intentos por email y 30 por IP cada 15 minutos.
  const blocked = await takeAttempt(["login", parsed.data.email], ["loginIp", await getClientIp()]);
  if (blocked) {
    await logAudit({ actorId: null, action: "LOGIN_RATE_LIMITED", resource: "auth" });
    return { ok: false, error: blocked };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    if (error.code === "email_not_confirmed") {
      // Cuenta creada pero sin confirmar: se reenvía el código y se continúa en /verify.
      await supabase.auth.resend({ type: "signup", email: parsed.data.email });
      await setPendingEmail(parsed.data.email);
      redirect("/verify");
    }
    if (error.code === "user_banned") redirect("/account-disabled");

    // Mensaje único para email inexistente y contraseña incorrecta (anti-enumeración).
    await logAudit({ actorId: null, action: "LOGIN_FAILED", resource: "auth", details: { reason: error.code ?? "unknown" } });
    return { ok: false, error: authErrorMessage(error, "Invalid email or password.") };
  }

  await clearAttempts("login", parsed.data.email);
  await logAudit({ actorId: data.user.id, action: "LOGIN_SUCCESS", resource: "auth" });

  redirect(await destinationAfterSignIn(next ?? ""));
}

/** Cerrar sesión (botón "Sign out"). */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.sub) {
    await logAudit({ actorId: data.claims.sub, action: "LOGOUT", resource: "auth" });
  }
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}

/** Cierre de sesión silencioso para cuentas suspendidas (lo llama /account-disabled). */
export async function endDisabledSession(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
}
