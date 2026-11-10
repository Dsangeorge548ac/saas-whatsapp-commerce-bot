/**
 * Detalle de un pedido (se muestra en el panel lateral): cliente, entrega con enlace al mapa, productos y
 * totales, datos de pago pedidos, comprobantes, historial de estados y acciones del operador.
 *
 * Privacidad: la ubicación GPS y el teléfono solo los ven el dueño y los operadores con suscripción vigente
 * (RLS). El enlace al mapa se abre solo si el operador hace clic (es el único momento en que las
 * coordenadas salen hacia el servicio de mapas). Los comprobantes se abren por /api/files/proof/<id>
 * (con sesión, `no-store` y auditoría); nunca hay URL pública del archivo.
 */
import { ExternalLink, FileText, MapPin } from "lucide-react";
import { StatusBadge } from "@/components/layout/status-badge";
import { formatMoney, formatPaymentDetails } from "@/lib/whatsapp/format";
import { OrderActions } from "@/features/orders/components/OrderActions";
import type { OrderDetail as OrderDetailData } from "@/features/orders/queries";
import { STATUS_LABEL, STATUS_TONE } from "@/features/orders/status";

const ACTOR_LABEL = { customer: "Customer", bot: "Bot", operator: "Team", system: "System" } as const;
const PROOF_TONE = { submitted: "warning", accepted: "success", rejected: "danger" } as const;
const PROOF_LABEL = { submitted: "To review", accepted: "Accepted", rejected: "Rejected" } as const;
const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">{title}</h3>
      {children}
    </section>
  );
}

export function OrderDetail({ detail }: { detail: NonNullable<OrderDetailData> }) {
  const { order, items, proofs, history } = detail;
  const money = (amount: number) => formatMoney(amount, order.currency);
  const openProof = proofs.find((proof) => proof.status === "submitted") ?? null;
  const mapUrl = order.delivery_lat !== null && order.delivery_lng !== null ? `https://www.google.com/maps?q=${order.delivery_lat},${order.delivery_lng}` : null;
  // formatPaymentDetails escribe en formato de WhatsApp (*negrita*); en el panel se muestra sin asteriscos.
  const paymentText = formatPaymentDetails(order.payment_details_snapshot).replaceAll("*", "");

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={STATUS_TONE[order.status]}>{STATUS_LABEL[order.status]}</StatusBadge>
        <span className="text-xs text-fg-muted">Placed {dateTime.format(new Date(order.placed_at))}</span>
      </div>

      <Section title="Customer">
        <p className="text-sm font-medium text-fg">{order.customer_name_snapshot || "No name"}</p>
        <p className="text-sm text-fg-muted">{order.customer_phone_snapshot}</p>
      </Section>

      <Section title={order.fulfillment === "delivery" ? "Delivery" : "Pickup at the store"}>
        {order.fulfillment === "delivery" ? (
          <div className="flex flex-col gap-1.5 text-sm text-fg">
            {order.delivery_address_text ? <p>{order.delivery_address_text}</p> : <p className="text-fg-muted">No written address.</p>}
            {mapUrl ? (
              <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-1.5 text-sm font-medium underline underline-offset-2">
                <MapPin className="size-4" aria-hidden /> Open in maps <ExternalLink className="size-3" aria-hidden />
              </a>
            ) : null}
          </div>
        ) : null}
        {order.delivery_notes ? <p className="mt-2 rounded-lg bg-canvas px-3 py-2 text-sm text-fg">Note: {order.delivery_notes}</p> : null}
      </Section>

      <Section title="Items">
        <ul className="divide-y divide-border rounded-lg border border-border">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 truncate">{item.quantity} × {item.product_name_snapshot}</span>
              <span className="shrink-0 text-fg-muted">{money(item.line_total)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-2 space-y-1 text-sm">
          <div className="flex justify-between text-fg-muted"><dt>Subtotal</dt><dd>{money(order.subtotal)}</dd></div>
          {order.delivery_fee > 0 ? <div className="flex justify-between text-fg-muted"><dt>Delivery</dt><dd>{money(order.delivery_fee)}</dd></div> : null}
          <div className="flex justify-between font-semibold text-fg"><dt>Total</dt><dd>{money(order.total)}</dd></div>
        </dl>
      </Section>

      <Section title="Payment">
        {paymentText ? <pre className="whitespace-pre-wrap rounded-lg bg-canvas px-3 py-2 font-sans text-xs text-fg">{paymentText}</pre> : null}
        {proofs.length === 0 ? <p className="mt-2 text-sm text-fg-muted">No proof yet. The order appears on the board when the customer sends one.</p> : null}
        <ul className="mt-2 flex flex-col gap-3">
          {proofs.map((proof) => (
            <li key={proof.id} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <StatusBadge tone={PROOF_TONE[proof.status]}>{PROOF_LABEL[proof.status]}</StatusBadge>
                <span className="text-[11px] text-fg-muted">{dateTime.format(new Date(proof.created_at))}</span>
              </div>
              {proof.reference_number ? <p className="mt-2 text-sm text-fg">Reference: <span className="font-medium">{proof.reference_number}</span></p> : null}
              {proof.hasFile && proof.storage_path && !proof.storage_path.startsWith("dry-run/") ? (
                proof.storage_path.endsWith(".pdf") ? (
                  <a href={`/api/files/proof/${proof.id}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-2">
                    <FileText className="size-4" aria-hidden /> Open PDF
                  </a>
                ) : (
                  <a href={`/api/files/proof/${proof.id}`} target="_blank" rel="noopener noreferrer" className="mt-2 block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/files/proof/${proof.id}`} alt="Payment proof" loading="lazy" className="max-h-56 w-full rounded-lg border border-border object-contain" />
                  </a>
                )
              ) : null}
              {proof.status === "rejected" && proof.rejection_reason ? <p className="mt-2 text-xs text-fg-muted">Reason: {proof.rejection_reason}</p> : null}
            </li>
          ))}
        </ul>
      </Section>

      <OrderActions orderId={order.id} orderNumber={order.order_number} status={order.status} openProofId={openProof?.id ?? null} />

      <Section title="History">
        <ol className="flex flex-col gap-2.5 border-l border-border pl-4">
          {history.map((entry) => (
            <li key={entry.id} className="relative text-sm">
              <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-chart-muted-strong" aria-hidden />
              <p className="text-fg">
                <span className="font-medium">{STATUS_LABEL[entry.to_status]}</span>
                <span className="text-fg-muted"> · {entry.actorName ?? ACTOR_LABEL[entry.actor_type]}</span>
              </p>
              <p className="text-xs text-fg-muted">{dateTime.format(new Date(entry.created_at))}</p>
              {entry.reason ? <p className="text-xs text-fg-muted">“{entry.reason}”</p> : null}
            </li>
          ))}
        </ol>
      </Section>
    </>
  );
}
