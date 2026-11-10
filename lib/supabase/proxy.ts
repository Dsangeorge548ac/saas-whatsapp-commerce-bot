/**
 * Refresco de sesión para proxy.ts.
 *
 * Qué hace: valida el JWT de la cookie (getClaims) y, si el token caducó, Supabase lo renueva
 * y escribe las cookies nuevas en la respuesta.
 * Por qué así: los Server Components no pueden escribir cookies, así que el refresco
 * tiene que ocurrir aquí, antes de renderizar.
 * Seguridad: los headers anti-caché que pasa Supabase evitan que un CDN sirva la sesión
 * de un usuario a otro.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          // 1) La petición ve las cookies nuevas (para los Server Components de esta misma visita).
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          // 2) La respuesta las guarda en el navegador.
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  // No escribir código entre createServerClient y getClaims: podría cerrar la sesión por error.
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub ?? null;

  return { response, userId };
}

/** Redirige conservando las cookies de sesión recién refrescadas. */
export function redirectWithSession(
  request: NextRequest,
  sessionResponse: NextResponse,
  pathname: string,
  searchParams?: Record<string, string>,
) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = new URLSearchParams(searchParams).toString();
  const redirect = NextResponse.redirect(url);
  sessionResponse.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  sessionResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "location") redirect.headers.set(key, value);
  });
  return redirect;
}
