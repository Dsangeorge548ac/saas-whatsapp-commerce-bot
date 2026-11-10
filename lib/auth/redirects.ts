/**
 * Validación de rutas de retorno (?next=…).
 * Vector protegido: "open redirect". Sin esta validación, un enlace como
 * /login?next=https://sitio-falso.com mandaría al usuario a otro dominio tras iniciar sesión.
 */
export const DEFAULT_AFTER_LOGIN = "/dashboard";

export function safeNextPath(next: string | null | undefined): string {
  if (!next) return DEFAULT_AFTER_LOGIN;
  // Debe ser una ruta interna: empieza por "/" pero no por "//" ni "/\" (que el navegador trata como otro dominio).
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return DEFAULT_AFTER_LOGIN;
  // El navegador BORRA tabulaciones y saltos de línea de las URLs: "/\t/sitio.com" acabaría siendo
  // "//sitio.com" (otro dominio). Se rechaza cualquier carácter de control o barra invertida.
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return DEFAULT_AFTER_LOGIN;
  // Comprobación final: resuelta contra un origen ficticio, la URL debe seguir en ese origen.
  if (new URL(next, "https://internal.invalid").origin !== "https://internal.invalid") return DEFAULT_AFTER_LOGIN;
  // Nunca volver a pantallas de autenticación.
  if (["/login", "/register", "/verify"].some((path) => next === path || next.startsWith(`${path}/`))) {
    return DEFAULT_AFTER_LOGIN;
  }
  return next;
}
