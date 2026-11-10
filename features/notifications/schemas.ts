/**
 * Validaciones (Zod) del módulo de avisos: id, filtros de la lista (en la URL) y enlaces seguros.
 * Las usan las Server Actions (la validación que protege), la consulta y la página.
 */
import { z } from "zod";

export const PAGE_SIZE = 20;
export const notificationIdSchema = z.uuid();

export const listParamsSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
  filter: z.enum(["all", "unread"]).catch("all"),
});
export type ListParams = z.infer<typeof listParamsSchema>;

/** Solo se navega a rutas internas de la app ("/orders"); cualquier otra cosa se descarta (evita redirecciones abiertas). */
export function safeLink(link: string | null): string | null {
  if (!link || !link.startsWith("/") || link.startsWith("//") || link.includes("\\") || /[\u0000-\u001f]/.test(link)) return null;
  return link;
}

export type NotificationActionResult = { ok: true } | { ok: false; error: string };
