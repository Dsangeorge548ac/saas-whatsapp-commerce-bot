/**
 * URL pública de la tienda de un comercio: <slug>.<dominio base>. En local (localhost) usa http.
 * Quién lo usa: el bot (enlace personal al catálogo) y el panel (dirección de la tienda y enlaces para compartir).
 */
import { publicEnv } from "@/lib/env";

export function storeUrl(slug: string, path: string): string {
  const domain = publicEnv.NEXT_PUBLIC_STORE_BASE_DOMAIN;
  const protocol = domain.includes("localhost") ? "http" : "https";
  return `${protocol}://${slug}.${domain}${path}`;
}
