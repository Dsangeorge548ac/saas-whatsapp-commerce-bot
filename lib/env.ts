/**
 * Variables de entorno PÚBLICAS (llegan al navegador).
 *
 * Qué hace: valida con Zod las variables NEXT_PUBLIC_* y exporta un objeto tipado.
 * Por qué así: si falta una variable, la app falla al arrancar con un mensaje claro
 * en lugar de fallar a medias (en local y en Vercel por igual).
 * Seguridad: aquí NUNCA va un secreto; todo lo de este archivo es visible en el navegador.
 * Los secretos viven en lib/env.server.ts.
 *
 * Nota: cada variable se lee escrita literalmente (process.env.NEXT_PUBLIC_X) porque
 * Next.js solo puede "inlinear" en el bundle del navegador las referencias literales.
 */
import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  // Base de todas las URLs absolutas (emails, redirecciones). Nunca escribir "localhost" en el código.
  NEXT_PUBLIC_APP_URL: z.url(),
  // Dominio base de las tiendas públicas: cada comercio vive en <slug>.<dominio>.
  NEXT_PUBLIC_STORE_BASE_DOMAIN: z.string().min(1),
  // Nombre de la marca que se muestra junto al logo (provisional hasta definir el definitivo).
  NEXT_PUBLIC_APP_NAME: z.string().min(1),
});

const parsed = publicEnvSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_STORE_BASE_DOMAIN: process.env.NEXT_PUBLIC_STORE_BASE_DOMAIN,
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
});

if (!parsed.success) {
  // Se listan solo los NOMBRES de las variables con problemas, nunca sus valores.
  const missing = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
  throw new Error(`Variables de entorno públicas inválidas o faltantes: ${missing}. Revisa .env.local (o Vercel).`);
}

export const publicEnv = parsed.data;
