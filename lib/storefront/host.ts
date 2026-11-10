/**
 * Subdominio de una tienda pública: <slug>.<dominio base>.
 *
 * Qué hace: dado el encabezado Host de la petición, devuelve el slug del comercio o null si no es una
 * tienda (la app principal, otro dominio, un subdominio reservado o un valor mal formado).
 * Seguridad: el Host lo controla quien hace la petición, así que se valida con una expresión estricta
 * (una sola etiqueta a-z0-9 con guiones) antes de usarlo en una ruta interna; los subdominios
 * reservados (los mismos que bloquea la base al crear comercios) y el host de la propia app nunca
 * se tratan como tienda.
 * Quién lo usa: proxy.ts.
 */

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Mismos nombres que reserva reject_reserved_slug() en la base de datos. */
export const RESERVED_SLUGS = [
  "www", "app", "api", "admin", "mail", "email", "static", "assets", "cdn", "dashboard", "login", "register",
  "support", "help", "docs", "status", "blog", "auth", "billing", "webhooks", "ftp", "smtp", "staging", "dev", "test",
];

export function storeSlugFromHost(host: string | null, baseDomain: string, appHost?: string): string | null {
  if (!host) return null;
  const normalizedHost = host.trim().toLowerCase();
  const suffix = `.${baseDomain.trim().toLowerCase()}`;
  if (appHost && normalizedHost === appHost.trim().toLowerCase()) return null;
  if (!normalizedHost.endsWith(suffix)) return null;

  const slug = normalizedHost.slice(0, -suffix.length);
  if (slug.length < 3 || slug.length > 60 || !SLUG.test(slug) || RESERVED_SLUGS.includes(slug)) return null;
  return slug;
}
