/**
 * Lista de avisos con filtro (todos / sin leer) y paginación; el estado vive en la URL (TableToolbar). Es
 * presentacional: recibe los datos ya consultados (así se puede previsualizar con datos de ejemplo).
 */
import { Bell } from "lucide-react";
import { EmptyState, Pagination } from "@/components/data/data-table";
import { TableToolbar } from "@/components/data/table-toolbar";
import { MarkAllReadButton } from "@/features/notifications/components/MarkAllReadButton";
import { NotificationRow } from "@/features/notifications/components/NotificationRow";
import type { NotificationItem } from "@/features/notifications/queries";
import type { ListParams } from "@/features/notifications/schemas";

type Props = { items: NotificationItem[]; total: number; page: number; pageCount: number; params: ListParams; now: Date };

export function NotificationList({ items, total, page, pageCount, params, now }: Props) {
  const href = (nextPage: number) => `/notifications?filter=${params.filter}&page=${nextPage}`;
  const hasUnread = items.some((item) => !item.read);
  return (
    <div className="flex flex-col gap-4">
      <TableToolbar
        tabs={{ name: "filter", defaultValue: "all", label: "Filter notifications", items: [{ value: "all", label: "All" }, { value: "unread", label: "Unread" }] }}
        action={hasUnread ? <MarkAllReadButton /> : null}
      />

      {items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={params.filter === "unread" ? "You're all caught up" : "No notifications yet"}
          text={params.filter === "unread" ? "New alerts will show up here." : "New orders, payment proofs and agent requests will show up here."}
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          {items.map((item) => <NotificationRow key={item.id} item={item} now={now} />)}
        </ul>
      )}

      <Pagination page={page} pageCount={pageCount} total={total} noun={total === 1 ? "notification" : "notifications"} href={href} />
    </div>
  );
}
