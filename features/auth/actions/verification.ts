"use server";
/**
 * Server Actions de verificación del email (OtpVerification): código de 6 dígitos que Supabase
 * envía al registrarse. No hay verificación por teléfono: los usuarios de la app son el dueño y
 * sus operadores, y el correo ya los identifica.
 *
 * El navegador nunca decide que algo está verificado: solo envía el código. Si es correcto,
 * Supabase confirma el correo y recién entonces se crea el comercio del dueño.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { clearPendingEmail, getPendingEmail } from "@/lib/auth/pending-signup";
import { clearAttempts, getClientIp, takeAttempt } from "@/lib/auth/rate-limit";
import { ensureTenantFromSignup } from "@/lib/auth/tenant";
import { authErrorMessage } from "@/features/auth/errors";
import { otpSchema, type ActionResult } from "@/features/auth/schemas";

/** Verifica el código del email. Si es correcto, Supabase crea la sesión y se crea el comercio. */
export async function verifyEmailCode(input: unknown): Promise<ActionResult> {
  const parsed = otpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter the 6-digit code." };

  // El email sale de la cookie httpOnly del servidor, nunca del navegador.
  const email = await getPendingEmail();
  if (!email) return { ok: false, error: "Your verification session expired. Sign in again to get a new code." };

  // Anti fuerza bruta del código: por email y por IP.
  const blocked = await takeAttempt(["otp", `signup:${email}`], ["otpIp", await getClientIp()]);
  if (blocked) return { ok: false, error: blocked };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token: parsed.data.code, type: "email" });
  if (error) return { ok: false, error: authErrorMessage(error, "This code is invalid or has expired. Request a new one.") };
  await clearAttempts("otp", `signup:${email}`);
  await clearPendingEmail();

  // Correo confirmado → se crea el comercio con los datos del registro (si los trae).
  await ensureTenantFromSignup(supabase);
  await logAudit({ actorId: data.user?.id ?? null, action: "EMAIL_VERIFIED", resource: "auth" });
  redirect("/dashboard");
}

/** Reenvía el código del email. Respuesta genérica aunque el email no exista. */
export async function resendEmailCode(): Promise<ActionResult> {
  const email = await getPendingEmail();
  if (!email) return { ok: false, error: "Your verification session expired. Sign in again to get a new code." };

  const blocked = await takeAttempt(["send", `signup:${email}`], ["sendIp", await getClientIp()]);
  if (blocked) return { ok: false, error: blocked };

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ type: "signup", email });
  if (error && (error.status === 429 || error.code?.startsWith("over_"))) {
    return { ok: false, error: authErrorMessage(error) };
  }
  return { ok: true, message: "If your account needs it, a new code is on its way." };
}
