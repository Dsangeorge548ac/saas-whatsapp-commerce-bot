/**
 * Consultas del tablero de pedidos (con la sesión del usuario: RLS limita todo al comercio y exige
 * suscripción vigente para operadores; el dueño siempre puede leer).
 *
 * Reglas de rendimiento: cada columna del Kanban pide solo sus filas más antiguas/recientes (máx. 25) con
 * el total real (count), y el historial se pagina en la base de datos (count + range). Los renglones y los
 * comprobantes de las tarjetas se piden en UNA consulta por tipo (no una por pedido).
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { HistoryParams } from "@/features/orders/schemas";
import type { OrderStatus } from "@/features/orders/status";

export const COLUMN_LIMIT = 25;
export const HISTORY_PAGE_SIZE = 15;

const CARD_COLUMNS = "id, order_number, status, fulfillment, customer_name_snapshot, customer_phone_snapshot, total, currency, placed_at, updated_at";

export type ProofState = "submitted" | "accepted" | "rejected" | null;

export type OrderCard = {
  id: string;
  number: number;
  status: OrderStatus;
  fulfillment: "delivery" | "pickup";
  customerName: string | null;
  phone: string;
  total: number;
  currency: string;
  placedAt: string;
  updatedAt: string;
  itemCount: number;
  proof: ProofState;
};

type CardRow = {
  id: string;
  order_number: number;
  status: OrderStatus;
  fulfillment: "delivery" | "pickup";
  customer_name_snapshot: string | null;
  customer_phone_snapshot: string;
  total: number;
  currency: string;
  placed_at: string;
  updated_at: string;
};

/** Agrega a cada pedido su cantidad de productos y el estado de su comprobante más reciente. */
async function toCards(rows: CardRow[]): Promise<OrderCard[]> {
  if (rows.length === 0) return [];
  const supabase = await createClient();
  const ids = rows.map((row) => row.id);
  const [items, proofs] = await Promise.all([
    supabase.from("order_items").select("order_id, quantity").in("order_id", ids),
    supabase.from("payment_proofs").select("order_id, status, created_at").in("order_id", ids).order("created_at", { ascending: false }),
  ]);
  const counts = new Map<string, number>();
  for (const item of items.data ?? []) counts.set(item.order_id, (counts.get(item.order_id) ?? 0) + item.quantity);
  const latestProof = new Map<string, ProofState>();
  for (const proof of proofs.data ?? []) if (!latestProof.has(proof.order_id)) latestProof.set(proof.order_id, proof.status);

  return rows.map((row) => ({
    id: row.id,
    number: row.order_number,
    status: row.status,
    fulfillment: row.fulfillment,
    customerName: row.customer_name_snapshot,
    phone: row.customer_phone_snapshot,
    total: row.total,
    currency: row.currency,
    placedAt: row.placed_at,
    updatedAt: row.updated_at,
    itemCount: counts.get(row.id) ?? 0,
    proof: latestProof.get(row.id) ?? null,
  }));
}

export type Column = { cards: OrderCard[]; total: number };

async function loadColumn(tenantId: string, status: OrderStatus, newestFirst: boolean, since?: string): Promise<Column> {
  const supabase = await createClient();
  let query = supabase.from("orders").select(CARD_COLUMNS, { count: "exact" }).eq("tenant_id", tenantId).eq("status", status);
  if (since) query = query.gte("updated_at", since);
  const { data, count } = await query.order(newestFirst ? "updated_at" : "placed_at", { ascending: !newestFirst }).limit(COLUMN_LIMIT);
  return { cards: await toCards((data ?? []) as CardRow[]), total: count ?? 0 };
}

/** Tablero: pendientes/aprobados/en camino (más antiguos primero), entregados de los últimos 7 días y bandeja sin pagar. */
export async function getBoard(tenantId: string) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 3_600_000).toISOString();
  const [pending, approved, onTheWay, delivered, unpaid] = await Promise.all([
    loadColumn(tenantId, "pending", false),
    loadColumn(tenantId, "approved", false),
    loadColumn(tenantId, "on_the_way", false),
    loadColumn(tenantId, "delivered", true, weekAgo),
    loadColumn(tenantId, "awaiting_payment", true),
  ]);
  return { columns: { pending, approved, on_the_way: onTheWay, delivered } as Record<string, Column>, unpaid };
}

/** Historial paginado en la base de datos (entregados o cancelados). */
export async function listHistory(tenantId: string, params: HistoryParams) {
  const supabase = await createClient();
  const build = (page: number) =>
    supabase
      .from("orders")
      .select(CARD_COLUMNS, { count: "exact" })
      .eq("tenant_id", tenantId)
      .eq("status", params.status)
      .order("updated_at", { ascending: false })
      .range((page - 1) * HISTORY_PAGE_SIZE, page * HISTORY_PAGE_SIZE - 1);

  let page = params.page;
  const first = await build(page);
  let rows = first.data;
  const total = first.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));
  if (page > pageCount) {
    page = pageCount;
    rows = (await build(page)).data;
  }
  return { cards: await toCards((rows ?? []) as CardRow[]), total, page, pageCount };
}

export type OrderDetail = Awaited<ReturnType<typeof getOrderDetail>>;

/** Detalle completo de un pedido (null si no existe o no es de este comercio: RLS no devuelve la fila). */
export async function getOrderDetail(tenantId: string, orderId: string) {
  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, fulfillment, customer_name_snapshot, customer_phone_snapshot, delivery_address_text, delivery_notes, delivery_lat, delivery_lng, currency, subtotal, delivery_fee, total, payment_method_type, payment_details_snapshot, placed_at",
    )
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!order) return null;

  const [items, proofs, history] = await Promise.all([
    supabase.from("order_items").select("id, product_name_snapshot, unit_price, quantity, line_total").eq("order_id", orderId).order("product_name_snapshot"),
    supabase
      .from("payment_proofs")
      .select("id, storage_path, reference_number, status, rejection_reason, created_at, reviewed_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false }),
    supabase.from("order_status_history").select("id, from_status, to_status, actor_type, actor_user_id, reason, created_at").eq("order_id", orderId).order("created_at"),
  ]);

  // Nombres de quienes hicieron cambios (los operadores del mismo comercio son visibles por RLS).
  const actorIds = [...new Set((history.data ?? []).map((row) => row.actor_user_id).filter((id): id is string => Boolean(id)))];
  const { data: actors } = actorIds.length ? await supabase.from("profiles").select("id, first_name, last_name").in("id", actorIds) : { data: [] };
  const names = new Map((actors ?? []).map((actor) => [actor.id, `${actor.first_name} ${actor.last_name}`.trim() || "Team member"]));

  return {
    order,
    items: items.data ?? [],
    proofs: (proofs.data ?? []).map((proof) => ({ ...proof, hasFile: Boolean(proof.storage_path) })),
    history: (history.data ?? []).map((row) => ({ ...row, actorName: row.actor_user_id ? (names.get(row.actor_user_id) ?? "Team member") : null })),
  };
}
