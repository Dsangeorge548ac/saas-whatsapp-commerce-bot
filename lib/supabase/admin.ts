/**
 * Cliente ADMIN de Supabase (service role): salta RLS por completo.
 *
 * Solo se usa en el servidor para:
 *   - registrar auditoría (log_audit solo lo puede ejecutar la service role),
 *   - acciones de administración (siempre después de requireAdmin()),
 *   - el webhook de Stripe.
 * Seguridad: `server-only` hace fallar el build si un Client Component lo importa.
 */
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { getServerEnv } from "@/lib/env.server";
import type { Database } from "@/types/database";

export function createAdminClient() {
  return createClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, getServerEnv().SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
