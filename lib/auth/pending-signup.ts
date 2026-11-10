/**
 * Email "pendiente de confirmar" entre el registro y el código OTP.
 *
 * Por qué existe: con "Confirm email" activado, Supabase NO crea sesión al registrarse,
 * así que /verify no sabría a qué email pertenece el código.
 * Por qué una cookie y no la URL: el email es un dato personal; en la URL quedaría en el
 * historial, en logs y en el header Referer.
 * Seguridad: httpOnly (JavaScript no la lee), sameSite=lax, secure en HTTPS y caduca en 1 hora.
 * Solo contiene el email que el propio usuario escribió; no da acceso a nada por sí sola.
 */
import "server-only";
import { cookies } from "next/headers";

const COOKIE_NAME = "bot_pending_email";
const ONE_HOUR_IN_SECONDS = 60 * 60;

export async function setPendingEmail(email: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, email, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_HOUR_IN_SECONDS,
  });
}

export async function getPendingEmail(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value ?? null;
}

export async function clearPendingEmail() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
