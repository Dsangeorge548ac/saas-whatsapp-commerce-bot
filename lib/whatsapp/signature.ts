/**
 * Verificación de la firma del webhook de Meta (X-Hub-Signature-256).
 *
 * Qué hace: calcula HMAC-SHA256 del cuerpo CRUDO con el app secret de la app de Meta y lo compara con
 * la cabecera. Es la autenticación del webhook (no hay sesión): se hace ANTES de tocar la base.
 * Seguridad: comparación en tiempo constante (timingSafeEqual) y sobre los bytes originales; parsear
 * el JSON antes cambiaría los bytes y rompería la verificación.
 * Quién lo usa: app/api/webhooks/whatsapp/route.ts.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifySignature(rawBody: Buffer | string, header: string | null, appSecret: string): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const given = Buffer.from(header.slice("sha256=".length), "hex");
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  // Una firma con caracteres no hexadecimales produce un Buffer más corto: se rechaza por longitud.
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Comparación en tiempo constante de dos textos (token de verificación del GET). */
export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}
