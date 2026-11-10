/**
 * Tablero Kanban: Pending · Approved · On the way · Delivered, más la bandeja "Waiting for payment".
 *
 * Los pedidos nacen en "Waiting for payment" y NO aparecen en el tablero hasta que llega el comprobante
 * (entonces pasan a Pending y se avisa al equipo). Cada columna muestra hasta 25 pedidos con el total real;
 * los entregados son los de los últimos 7 días y el resto está en el historial. En pantallas pequeñas las
 * columnas se deslizan horizontalmente.
 */
import Link from "next/link";
import { Hourglass } from "lucide-react";
import { OrderCard } from "@/features/orders/components/OrderCard";
import { BOARD_COLUMNS } from "@/features/orders/status";
import { COLUMN_LIMIT, type Column } from "@/features/orders/queries";

type Props = {
  columns: Record<string, Column>;
  unpaid: Column;
  selectedId: string | null;
  now: Date;
};

const detailHref = (id: string) => `/orders?order=${id}`;

export function KanbanBoard({ columns, unpaid, selectedId, now }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0">
        {BOARD_COLUMNS.map(({ status, title, hint }) => {
          const column = columns[status] ?? { cards: [], total: 0 };
          const hidden = column.total - column.cards.length;
          return (
            <section key={status} aria-labelledby={`col-${status}`} className="w-72 shrink-0 snap-start rounded-lg bg-canvas p-3 lg:w-auto">
              <header className="mb-3 flex items-baseline justify-between gap-2 px-1">
                <div>
                  <h2 id={`col-${status}`} className="text-sm font-semibold text-fg">{title}</h2>
                  <p className="text-xs text-fg-muted">{hint}</p>
                </div>
                <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-fg-muted">{column.total}</span>
              </header>
              <ul className="flex flex-col gap-2.5">
                {column.cards.map((order) => (
                  <li key={order.id}>
                    <OrderCard order={order} href={detailHref(order.id)} selected={selectedId === order.id} now={now} />
                  </li>
                ))}
                {column.cards.length === 0 ? <li className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-xs text-fg-muted">No orders here</li> : null}
              </ul>
              {hidden > 0 ? (
                <p className="mt-3 px-1 text-xs text-fg-muted">
                  {status === "delivered" ? (
                    <>Showing the latest {COLUMN_LIMIT}. <Link href="/orders?view=history" className="font-medium text-fg underline underline-offset-2">See history</Link></>
                  ) : (
                    <>+{hidden} more waiting. Showing the oldest {COLUMN_LIMIT}.</>
                  )}
                </p>
              ) : null}
            </section>
          );
        })}
      </div>

      {/* Bandeja de pedidos que aún no se pagan: no son parte del flujo del tablero. */}
      <details className="group rounded-lg border border-border bg-surface" open={unpaid.total > 0 && unpaid.total <= 6}>
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm font-medium text-fg">
          <Hourglass className="size-4 text-fg-muted" aria-hidden />
          Waiting for payment
          <span className="rounded-full bg-canvas px-2 py-0.5 text-xs text-fg-muted">{unpaid.total}</span>
          <span className="w-full text-xs font-normal text-fg-muted sm:ml-auto sm:w-auto">Orders appear on the board once the customer sends a proof</span>
        </summary>
        <div className="border-t border-border p-3">
          {unpaid.cards.length === 0 ? (
            <p className="px-1 py-4 text-center text-xs text-fg-muted">No orders waiting for payment.</p>
          ) : (
            <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {unpaid.cards.map((order) => (
                <li key={order.id}>
                  <OrderCard order={order} href={detailHref(order.id)} selected={selectedId === order.id} now={now} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </div>
  );
}
