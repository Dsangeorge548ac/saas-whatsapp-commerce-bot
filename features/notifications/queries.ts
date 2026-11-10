/**
 * Consulta de avisos del usuario (con su sesión: RLS solo entrega SUS avisos). Paginación y filtro en el
 * servidor con count + range.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { PAGE_SIZE, safeLink, type ListParams } from "@/features/notifications/schemas";

export type NotificationItem = { id: string; kind: string; title: string; link: string | null; read: boolean; createdAt: string };

export async function listNotifications(params: ListParams) {
  const supabase = await createClient();
  const from = (params.page - 1) * PAGE_SIZE;
  let query = supabase
    .from("notifications")
    .select("id, kind, title, link, read_at, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (params.filter === "unread") query = query.is("read_at", null);
  const { data, count } = await query;

  const total = count ?? 0;
  const items: NotificationItem[] = (data ?? []).map((row) => ({
    id: row.id, kind: row.kind, title: row.title, link: safeLink(row.link), read: Boolean(row.read_at), createdAt: row.created_at,
  }));
  return { items, total, page: params.page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}
