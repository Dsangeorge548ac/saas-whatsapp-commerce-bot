/**
 * Proxy de Next.js 16 (antes "middleware").
 *
 * Solo hace comprobaciones baratas, sin consultar la base de datos:
 *   1. Refresca la sesión de Supabase.
 *   2. Sin sesión en una ruta protegida → /login?next=<ruta>.
 *   3. Con sesión en login/registro → /dashboard.
 *   4. "/" → /dashboard o /login.
 * Las reglas de suscripción y rol se comprueban en los layouts, en la base de datos (RLS y
 * funciones) y en cada Server Action: el proxy NO es la única barrera de seguridad.
 * Las tiendas públicas (<comercio>.<dominio>) se agregarán aquí con la reescritura por subdominio.
 */
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";
import { storeSlugFromHost } from "@/lib/storefront/host";
import { redirectWithSession, updateSession } from "@/lib/supabase/proxy";

const PROTECTED_PREFIXES = ["/dashboard", "/orders", "/chats", "/catalog", "/settings", "/notifications", "/profile", "/admin"];
const GUEST_ONLY_PATHS = ["/login", "/register"];

function matches(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function proxy(request: NextRequest) {
  // Tienda pública (<comercio>.<dominio>): sin sesión ni cookies. Se reescribe a /s/<slug>/…; cualquier
  // ruta de la app (login, dashboard, API privada…) en un subdominio de tienda cae en un 404.
  const slug = storeSlugFromHost(request.headers.get("host"), publicEnv.NEXT_PUBLIC_STORE_BASE_DOMAIN, new URL(publicEnv.NEXT_PUBLIC_APP_URL).host);
  if (slug) {
    const { pathname } = request.nextUrl;
    if (pathname.startsWith("/api/public-files/")) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = `/s/${slug}${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url);
  }

  const { response, userId } = await updateSession(request);
  const { pathname } = request.nextUrl;

  // Sin landing: "/" lleva al dashboard con sesión, o al login sin ella.
  if (pathname === "/") {
    return redirectWithSession(request, response, userId ? "/dashboard" : "/login");
  }

  if (!userId && matches(pathname, PROTECTED_PREFIXES)) {
    // Solo la ruta (dato no sensible). Se valida otra vez al usarla (safeNextPath).
    return redirectWithSession(request, response, "/login", { next: pathname });
  }

  if (userId && matches(pathname, GUEST_ONLY_PATHS)) {
    return redirectWithSession(request, response, "/dashboard");
  }

  return response;
}

export const config = {
  // Todo menos archivos estáticos e imágenes. (El webhook de WhatsApp no usa cookies de sesión.)
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
