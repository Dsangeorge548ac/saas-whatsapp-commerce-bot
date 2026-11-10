/**
 * /orders — Tablero Kanban de pedidos (Pending · Approved · On the way · Delivered) e historial.
 *
 * Requiere suscripción vigente: sin ella se muestra la compuerta (y la base de datos tampoco entrega los
 * pedidos a un operador sin suscripción). El detalle de un pedido se abre con ?order=<id> en un panel
 * lateral renderizado por el servidor; el id se valida y se vuelve a resolver con RLS (un id de otro
 * comercio simplemente no devuelve nada). El tablero se actualiza solo (Realtime).
 */
import { Suspense } from "react";
import type { Metadata } from "next";
import { SubscriptionGate } from "@/components/layout/subscription-gate";
import { HistoryTable } from "@/features/orders/components/HistoryTable";
import { KanbanBoard } from "@/features/orders/components/KanbanBoard";
import { OrderDetail } from "@/features/orders/components/OrderDetail";
import { OrderSheet } from "@/features/orders/components/OrderSheet";
import { RealtimeRefresh } from "@/features/orders/components/RealtimeRefresh";
import { getBoard, getOrderDetail } from "@/features/orders/queries";
import { SegmentedLinks } from "@/components/data/segmented";
import { historyParamsSchema, orderIdSchema } from "@/features/orders/schemas";
import { currentMembership, requireWorkspace } from "@/lib/data/workspace";

export const metadata: Metadata = { title: "Orders" };

export default function OrdersPage({ searchParams }: PageProps<"/orders">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-canvas" aria-busy="true" />}>
      <OrdersContent searchParams={searchParams} />
    </Suspense>
  );
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

async function OrdersContent({ searchParams }: Pick<PageProps<"/orders">, "searchParams">) {
  const query = await searchParams;
  const membership = currentMembership(await requireWorkspace());
  if (!membership?.billable) return <SubscriptionGate isOwner={membership?.role === "owner"} feature="Orders" />;

  const view = first(query.view) === "history" ? "history" : "board";
  const history = historyParamsSchema.parse({ page: first(query.page), status: first(query.status) });
  const orderId = orderIdSchema.safeParse(first(query.order));
  const detail = orderId.success ? await getOrderDetail(membership.tenant_id, orderId.data) : null;
  const closeHref = view === "history" ? `/orders?view=history&status=${history.status}&page=${history.page}` : "/orders";
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <RealtimeRefresh tenantId={membership.tenant_id} />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium tracking-tight text-fg">Orders</h1>
          <p className="mt-1 text-sm text-fg-muted">Orders reach the board once the customer sends a payment proof. The board updates by itself.</p>
        </div>
        <SegmentedLinks
          label="Orders view"
          items={[
            { href: "/orders", label: "Board", active: view === "board" },
            { href: "/orders?view=history", label: "History", active: view === "history" },
          ]}
        />
      </header>

      {view === "board" ? <BoardView tenantId={membership.tenant_id} selectedId={detail?.order.id ?? null} now={now} /> : <HistoryTable tenantId={membership.tenant_id} params={history} />}

      {detail ? (
        <OrderSheet title={`Order #${detail.order.order_number}`} closeHref={closeHref}>
          <OrderDetail detail={detail} />
        </OrderSheet>
      ) : null}
    </div>
  );
}

async function BoardView({ tenantId, selectedId, now }: { tenantId: string; selectedId: string | null; now: Date }) {
  const { columns, unpaid } = await getBoard(tenantId);
  return <KanbanBoard columns={columns} unpaid={unpaid} selectedId={selectedId} now={now} />;
}
