/**
 * Tarjeta de un pedido en el tablero: número, cliente, productos, total, tipo de entrega, antigüedad y
 * estado del comprobante. Es un enlace (?order=<id>) que abre el detalle en el panel lateral.
 * El estado nunca va solo con color: siempre hay texto (y un icono en el comprobante).
 */
import Link from "next/link";
import { FileCheck2, FileClock, FileX2, Store, Truck } from "lucide-react";
import { formatMoney } from "@/lib/whatsapp/format";
import { timeAgo } from "@/lib/time-ago";
import { cn } from "@/lib/utils";
import type { OrderCard as OrderCardData } from "@/features/orders/queries";

const PROOF = {
  submitted: { label: "Proof received", Icon: FileClock, className: "text-fg" },
  accepted: { label: "Proof accepted", Icon: FileCheck2, className: "text-fg-muted" },
  rejected: { label: "Proof rejected", Icon: FileX2, className: "text-danger-strong" },
} as const;

export function OrderCard({ order, href, selected, now }: { order: OrderCardData; href: string; selected: boolean; now: Date }) {
  const proof = order.proof ? PROOF[order.proof] : null;
  const FulfillmentIcon = order.fulfillment === "delivery" ? Truck : Store;
  const needsAction = order.status === "pending" && order.proof === "submitted";

  return (
    <Link
      href={href}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "block rounded-lg border bg-surface p-3.5 transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:outline-black",
        selected ? "border-black" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold text-fg">#{order.number}</span>
        <span className="text-[11px] text-fg-muted">{timeAgo(order.placedAt, now)}</span>
      </div>
      <p className="mt-1 truncate text-sm text-fg">{order.customerName || order.phone}</p>
      {order.customerName ? <p className="truncate text-xs text-fg-muted">{order.phone}</p> : null}
      <div className="mt-2.5 flex items-center justify-between gap-2 text-xs text-fg-muted">
        <span className="inline-flex items-center gap-1.5">
          <FulfillmentIcon className="size-3.5" aria-hidden />
          {order.fulfillment === "delivery" ? "Delivery" : "Pickup"} · {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
        </span>
        <span className="text-sm font-semibold text-fg">{formatMoney(order.total, order.currency)}</span>
      </div>
      {proof ? (
        <p className={cn("mt-2 inline-flex items-center gap-1.5 text-xs font-medium", proof.className)}>
          <proof.Icon className="size-3.5" aria-hidden />
          {proof.label}
          {needsAction ? <span className="rounded-full bg-black px-1.5 py-px text-[10px] font-semibold text-white">Review</span> : null}
        </p>
      ) : null}
    </Link>
  );
}
