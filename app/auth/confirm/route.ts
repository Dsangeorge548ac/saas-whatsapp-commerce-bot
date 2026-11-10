/**
 * GET /auth/confirm?token_hash=…&type=…&next=…
 *
 * Respaldo para enlaces de email (si alguna plantilla de Supabase usa enlace en vez de código).
 * Verifica el token en el servidor, crea la sesión y redirige a una ruta interna validada.
 * Seguridad: `next` pasa por safeNextPath (sin redirecciones a otros dominios) y el tipo
 * de token se limita a los que usa la app.
 */
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/redirects";

// "recovery" no se acepta por enlace: la recuperación de contraseña usa código (/forgot-password).
const ALLOWED_TYPES: EmailOtpType[] = ["signup", "email", "email_change"];

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(searchParams.get("next"));

  if (tokenHash && type && ALLOWED_TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  return NextResponse.redirect(new URL("/login?error=link_invalid", request.url));
}
