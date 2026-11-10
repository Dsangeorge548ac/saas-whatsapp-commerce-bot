/**
 * Límite de intentos anti fuerza bruta (solo servidor).
 *
 * Qué hace: antes de cada acción sensible (login, verificar un código, enviar un código, crear
 * cuenta) registra un intento con la función take_attempt() de la base. Si se supera el máximo
 * dentro de la ventana, la acción responde con un mensaje y no continúa.
 * Por qué hace falta: Supabase limita por IP, pero nuestras llamadas a Auth salen del servidor,
 * así que Supabase no ve la IP del atacante. Aquí se cuenta por cuenta y por IP real.
 * Quién lo usa: features/auth/actions/*.
 *
 * Seguridad:
 *   - Las claves se guardan con SHA-256: la tabla nunca contiene emails ni IPs en claro.
 *   - El bloqueo aplica igual exista o no la cuenta (no revela qué emails están registrados).
 *   - Si la base de datos falla, se NIEGA el intento (falla cerrado).
 */
import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

type Rule = { max: number; windowSeconds: number };

const MINUTES_15 = 15 * 60;
const HOUR = 60 * 60;

/** Reglas por tipo de acción. Por cuenta son estrictas; por IP, más amplias (oficinas con varias personas). */
export const RATE_LIMITS = {
  /** Contraseña en el login, por email. */
  login: { max: 5, windowSeconds: MINUTES_15 },
  /** Contraseña en el login, por IP (un atacante probando muchos emails). */
  loginIp: { max: 30, windowSeconds: MINUTES_15 },
  /** Verificar un código de 6 dígitos (email o recuperación), por cuenta. */
  otp: { max: 5, windowSeconds: MINUTES_15 },
  /** Verificar códigos, por IP. */
  otpIp: { max: 30, windowSeconds: MINUTES_15 },
  /** Enviar un código por email, por cuenta. */
  send: { max: 5, windowSeconds: HOUR },
  /** Enviar códigos, por IP. */
  sendIp: { max: 15, windowSeconds: HOUR },
  /** Crear cuentas, por IP. */
  signUpIp: { max: 10, windowSeconds: HOUR },
  /** Enviar un pedido desde la tienda pública, por IP y por enlace personal. */
  webOrderIp: { max: 20, windowSeconds: HOUR },
  webOrderToken: { max: 10, windowSeconds: HOUR },
  /** Conectar o rotar las credenciales de WhatsApp, por comercio. */
  connectWhatsApp: { max: 10, windowSeconds: HOUR },
  /** Mensajes de un asesor a un cliente, por usuario (frena bucles y errores de pegado masivo). */
  agentMessage: { max: 40, windowSeconds: 60 },
  /** Cambiar contraseña o correo desde el perfil (exige la contraseña actual), por usuario. */
  profileSecurity: { max: 5, windowSeconds: MINUTES_15 },
} satisfies Record<string, Rule>;

export type RateLimitRule = keyof typeof RATE_LIMITS;

/** Una comprobación: la regla y a quién se aplica (email, id de usuario o IP). */
export type RateLimitCheck = [rule: RateLimitRule, identifier: string | null | undefined];

/** IP real del cliente. En Vercel es la primera de x-forwarded-for. */
export async function getClientIp(): Promise<string | null> {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip");
}

function hashKey(rule: RateLimitRule, identifier: string) {
  return createHash("sha256").update(`${rule}:${identifier.trim().toLowerCase()}`).digest("hex");
}

function blockedMessage(windowSeconds: number) {
  const minutes = Math.max(1, Math.ceil(windowSeconds / 60));
  return `Too many attempts. Try again in about ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}

/**
 * Registra un intento en cada comprobación. Devuelve null si se permite, o el mensaje para el
 * usuario si alguna está bloqueada. Las comprobaciones sin identificador (p. ej. IP desconocida)
 * se omiten.
 */
export async function takeAttempt(...checks: RateLimitCheck[]): Promise<string | null> {
  const admin = createAdminClient();
  for (const [rule, identifier] of checks) {
    if (!identifier) continue;
    const { max, windowSeconds } = RATE_LIMITS[rule];
    const { data, error } = await admin.rpc("take_attempt", {
      p_scope: rule,
      p_key_hash: hashKey(rule, identifier),
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    // Falla cerrado: sin contador no se permite el intento.
    if (error) return "Something went wrong. Please try again in a moment.";
    if (data === false) return blockedMessage(windowSeconds);
  }
  return null;
}

/** Tras un acierto, borra el contador de esa cuenta (no el de la IP). */
export async function clearAttempts(rule: RateLimitRule, identifier: string | null | undefined): Promise<void> {
  if (!identifier) return;
  await createAdminClient().rpc("reset_attempts", { p_scope: rule, p_key_hash: hashKey(rule, identifier) });
}
