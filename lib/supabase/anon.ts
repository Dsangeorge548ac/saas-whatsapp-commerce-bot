/**
 * Cliente de Supabase SIN sesión (rol anon), para las páginas públicas de la tienda.
 *
 * Solo puede ejecutar las funciones de lectura pública (get_public_storefront / get_public_publication):
 * anon no tiene permiso sobre ninguna tabla. Sin cookies: la tienda es pública y no identifica a nadie.
 */
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

export function createAnonClient() {
  return createClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
