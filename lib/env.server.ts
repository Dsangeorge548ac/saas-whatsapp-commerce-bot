/**
 * Variables de entorno SECRETAS (solo servidor).
 *
 * Qué hace: valida con Zod los secretos cuando alguien los pide por primera vez.
 * Por qué así: la validación es "perezosa" (dentro de una función) para que la app compile
 * y arranque aunque todavía no se hayan configurado los secretos de fases futuras (Stripe).
 * Seguridad: `import "server-only"` hace que el build falle si un Client Component
 * importa este archivo, así ningún secreto puede terminar en el navegador.
 */
import "server-only";
import { z } from "zod";

const serverEnvSchema = z.object({
  // Acceso total a la base de datos saltándose RLS: solo para webhooks y acciones de admin.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // Stripe: opcionales para que la app arranque sin ellas; getStripe() avisa si faltan.
  // Los precios NO van aquí: se buscan en Stripe por su lookup_key (lib/stripe/plans.ts).
  STRIPE_SECRET_KEY: z.string().startsWith("sk_").optional(),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional(),
  // WhatsApp (una sola app de Meta para todos los comercios). Opcionales para que la app arranque sin
  // ellas; la ruta del webhook responde 503 si faltan (falla cerrado).
  META_APP_SECRET: z.string().min(8).optional(),
  META_WEBHOOK_VERIFY_TOKEN: z.string().min(8).optional(),
  // Versión de la Graph API de Meta. Verificar en la documentación vigente antes de producción.
  META_GRAPH_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v23.0"),
  // Solo desarrollo: no llama a Meta; registra los mensajes salientes en la base. Ignorado en producción.
  WHATSAPP_DRY_RUN: z.enum(["0", "1"]).default("0"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedServerEnv: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cachedServerEnv) return cachedServerEnv;

  const parsed = serverEnvSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || undefined,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || undefined,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || undefined,
    META_APP_SECRET: process.env.META_APP_SECRET || undefined,
    META_WEBHOOK_VERIFY_TOKEN: process.env.META_WEBHOOK_VERIFY_TOKEN || undefined,
    META_GRAPH_VERSION: process.env.META_GRAPH_VERSION || undefined,
    WHATSAPP_DRY_RUN: process.env.WHATSAPP_DRY_RUN || undefined,
  });

  if (!parsed.success) {
    // Solo nombres, nunca valores: los mensajes de error pueden acabar en logs.
    const missing = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Variables de entorno de servidor inválidas o faltantes: ${missing}.`);
  }

  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}
