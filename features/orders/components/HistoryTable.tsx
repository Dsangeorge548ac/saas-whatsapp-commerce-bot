/**
 * Historial de pedidos (entregados o cancelados), paginado en la base de datos. El filtro y la página
 * viven en la URL (TableToolbar); cada fila abre el detalle en el panel lateral.
 */
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { EmptyState, Pagination, TableCard, rowClass, tdClass, thClass, theadClass } from "@/components/data/data-table";
import { TableToolbar } from "@/components/data/table-toolbar";
import { StatusBadge } from "@/components/layout/status-badge";
import { formatMoney } from "@/lib/whatsapp/format";
import { listHistory } from "@/features/orders/queries";
import type { HistoryParams } from "@/features/orders/schemas";
import { STATUS_LABEL, STATUS_TONE } from "@/features/orders/status";
import { cn } from "@/lib/utils";

const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export async function HistoryTable({ tenantId, params }: { tenantId: string; params: HistoryParams }) {
  const { cards, total, page, pageCount } = await listHistory(tenantId, params);
  const link = (nextPage: number) => `/orders?view=history&status=${params.status}&page=${nextPage}`;

  return (
    <div className="flex flex-col gap-4">
      <TableToolbar
        keep={["view"]}
        tabs={{ name: "status", defaultValue: "delivered", label: "History filter", items: (["delivered", "cancelled"] as const).map((status) => ({ value: status, label: STATUS_LABEL[status] })) }}
      />

      {cards.length === 0 ? (
        <EmptyState icon={ClipboardList} title={`No ${STATUS_LABEL[params.status].toLowerCase()} orders yet`} text="Orders move here once they're delivered or cancelled." />
      ) : (
        <TableCard minWidth="36rem">
          <thead className={theadClass}>
            <tr>
              {["Order", "Customer", "Total", "Status", "Closed"].map((h) => <th key={h} scope="col" className={thClass}>{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {cards.map((order) => (
              <tr key={order.id} className={rowClass}>
                <td className={tdClass}>
                  <Link href={`/orders?order=${order.id}&view=history&status=${params.status}&page=${page}`} className="font-semibold text-fg underline-offset-2 hover:underline">#{order.number}</Link>
                </td>
                <td className={cn(tdClass, "text-fg-muted")}>{order.customerName || order.phone}</td>
                <td className={cn(tdClass, "font-medium text-fg")}>{formatMoney(order.total, order.currency)}</td>
                <td className={tdClass}><StatusBadge tone={STATUS_TONE[order.status]}>{STATUS_LABEL[order.status]}</StatusBadge></td>
                <td className={cn(tdClass, "whitespace-nowrap text-fg-muted")}>{date.format(new Date(order.updatedAt))}</td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      )}

      <Pagination page={page} pageCount={pageCount} total={total} noun={total === 1 ? "order" : "orders"} href={link} />
    </div>
  );
}
