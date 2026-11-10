"use server";
/**
 * Server Actions de recuperación de contraseña (ForgotPasswordForm), en tres pasos:
 *   1. requestPasswordReset: enviar un código de 6 dígitos al email.
 *   2. verifyRecoveryCode:   comprobar el código. Si es válido, Supabase abre una sesión
 *                            temporal y guardamos una marca (cookie httpOnly, 15 min).
 *   3. setNewPassword:       guardar la nueva contraseña. Solo funciona con esa marca, así
 *                            nadie puede saltarse el paso del código.
 * Sin enlaces: funciona igual en local y en Vercel. Requiere que la plantilla "Reset Password"
 * de Supabase use {{ .Token }} (docs/setup-dev.md).
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { clearAttempts, getClientIp, takeAttempt } from "@/lib/auth/rate-limit";
import { authErrorMessage } from "@/features/auth/errors";
import { emailSchema, forgotPasswordSchema, otpCodeSchema, passwordSchema, type ActionResult } from "@/features/auth/schemas";

const RECOVERY_COOKIE = "bot_recovery_verified";
const RECOVERY_WINDOW_SECONDS = 15 * 60;

/** Paso 1: enviar el código. Siempre responde lo mismo, exista o no el email (anti-enumeración). */
export async function requestPasswordReset(input: unknown): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid email address." };

  // Anti abuso: límite de códigos enviados por email y por IP.
  const blocked = await takeAttempt(["send", `recovery:${parsed.data.email}`], ["sendIp", await getClientIp()]);
  if (blocked) return { ok: false, error: blocked };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email);
  if (error && (error.status === 429 || error.code?.startsWith("over_"))) {
    // Límite de envíos de Supabase (por usuario cada 60 s, o el límite por hora del proyecto).
    return { ok: false, error: authErrorMessage(error, "Please wait a minute before requesting another code.") };
  }
  return { ok: true, message: "If an account exists for this email, we sent a 6-digit code." };
}

const verifySchema = z.object({ email: emailSchema, code: otpCodeSchema });

/** Paso 2: verificar el código. Si es correcto, deja al usuario listo para elegir la contraseña. */
export async function verifyRecoveryCode(input: unknown): Promise<ActionResult> {
  const parsed = verifySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter the 6-digit code." };

  // Anti fuerza bruta del código de 6 dígitos: 5 intentos por email y 30 por IP cada 15 min.
  const recoveryKey = `recovery:${parsed.data.email}`;
  const blocked = await takeAttempt(["otp", recoveryKey], ["otpIp", await getClientIp()]);
  if (blocked) return { ok: false, error: blocked };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email: parsed.data.email, token: parsed.data.code, type: "recovery" });
  if (error || !data.user) {
    return { ok: false, error: authErrorMessage(error, "This code is invalid or has expired. Request a new one.") };
  }
  await clearAttempts("otp", recoveryKey);

  // Marca de "código verificado" ligada a ESTE usuario y con caducidad corta.
  const cookieStore = await cookies();
  cookieStore.set(RECOVERY_COOKIE, data.user.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: RECOVERY_WINDOW_SECONDS,
  });
  return { ok: true };
}

const newPasswordSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((data) => data.password === data.confirmPassword, { path: ["confirmPassword"], message: "Passwords don't match." });

/** Paso 3: guardar la nueva contraseña (solo después de verificar el código). */
export async function setNewPassword(input: unknown): Promise<ActionResult> {
  const parsed = newPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the highlighted fields." };

  const supabase = await createClient();
  const cookieStore = await cookies();
  const verifiedUserId = cookieStore.get(RECOVERY_COOKIE)?.value;
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;

  // El código tiene que haberse verificado para este mismo usuario hace menos de 15 minutos.
  if (!userId || !verifiedUserId || verifiedUserId !== userId) {
    return { ok: false, error: "Your code expired. Request a new one." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, error: authErrorMessage(error, "We couldn't update your password. Try again.") };

  cookieStore.delete(RECOVERY_COOKIE);
  // Por seguridad, se cierran las sesiones abiertas en otros dispositivos.
  await supabase.auth.signOut({ scope: "others" });
  await logAudit({ actorId: userId, action: "PASSWORD_RESET", resource: "auth" });

  redirect("/dashboard");
}
