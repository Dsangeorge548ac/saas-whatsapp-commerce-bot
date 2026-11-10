/**
 * Traducción de errores de Supabase Auth a mensajes para el usuario.
 *
 * Seguridad: nunca se muestra el error crudo de Supabase. Los mensajes son genéricos a
 * propósito para no revelar si un email existe (enumeración de cuentas).
 */
import type { AuthError } from "@supabase/supabase-js";

const MESSAGES: Record<string, string> = {
  invalid_credentials: "Invalid email or password.",
  otp_expired: "This code is invalid or has expired. Request a new one.",
  otp_disabled: "This code is invalid or has expired. Request a new one.",
  over_email_send_rate_limit: "Too many emails were sent. Wait a few minutes and try again.",
  over_request_rate_limit: "Too many attempts. Wait a few minutes and try again.",
  weak_password: "Choose a stronger password (at least 12 characters).",
  same_password: "Your new password must be different from the current one.",
  session_not_found: "Your session expired. Sign in again.",
  user_banned: "This account has been disabled.",
};

const FALLBACK = "Something went wrong. Please try again.";

export function authErrorMessage(error: Pick<AuthError, "code" | "status"> | null | undefined, fallback = FALLBACK): string {
  if (!error) return fallback;
  const known = error.code ? MESSAGES[error.code] : undefined;
  if (known) return known;
  if (error.status === 429) return MESSAGES.over_request_rate_limit ?? fallback;
  return fallback;
}
