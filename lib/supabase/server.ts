/**
 * Cliente de Supabase para el SERVIDOR (Server Components, Server Actions, Route Handlers).
 *
 * Qué hace: crea un cliente que lee y escribe la sesión en las cookies de la petición.
 * Por qué así: cada petición necesita su propio cliente (la sesión es de cada usuario).
 * Seguridad: usa la clave publicable; los permisos reales los aplica RLS con el JWT del usuario.
 * Para decidir acceso, usa getClaims()/getUser(), nunca getSession() (no verifica el token).
 */
import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // En un Server Component no se pueden escribir cookies: Next lanza un error.
          // No pasa nada: proxy.ts ya refresca la sesión en cada petición.
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Ignorado a propósito (ver comentario de arriba).
          }
        },
      },
    },
  );
}
