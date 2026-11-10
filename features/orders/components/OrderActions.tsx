"use client";
/**
 * Acciones del operador sobre un pedido, según su estado:
 *   - Pendiente con comprobante: Accept (aprueba el pedido) / Reject (pide un motivo y se lo manda al cliente).
 *   - Aprobado: "Send on the way". En camino: "Mark as delivered".
 *   - Sin pagar, pendiente o aprobado: Cancel (motivo obligatorio).
 * Las acciones destructivas o que avisan al cliente piden confirmación. El servidor vuelve a comprobar todo;
 * esto solo decide qué botones se muestran. Si el cambio se guarda pero el aviso a WhatsApp falla, se
 * muestra una advertencia (el estado ya cambió).
 */
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, PackageCheck, Truck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/feedback/sweet-confirm";
import { notify } from "@/components/feedback/notify";
import { advanceOrder, approveProof, cancelOrder, rejectProof } from "@/features/orders/actions/order-actions";
import { CANCELLABLE, type OrderStatus } from "@/features/orders/status";

type Props = { orderId: string; orderNumber: number; status: OrderStatus; openProofId: string | null };

export function OrderActions({ orderId, orderNumber, status, openProofId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function run(task: () => Promise<{ ok: boolean; error?: string; warning?: string }>, success: string) {
    startTransition(async () => {
      const result = await task();
      if (!result.ok) return notify.error(result.error ?? "Something went wrong.");
      if (result.warning) notify.warning(success, result.warning);
      else notify.success(success);
      router.refresh();
    });
  }

  async function accept() {
    if (!openProofId) return;
    const answer = await confirmAction({ title: `Accept the payment for #${orderNumber}?`, text: "The order moves to Approved and the customer is notified on WhatsApp.", confirmLabel: "Accept payment" });
    if (answer.confirmed) run(() => approveProof(openProofId, orderId), "Payment accepted");
  }

  async function reject() {
    if (!openProofId) return;
    const answer = await confirmAction({
      title: `Reject the proof for #${orderNumber}?`,
      text: "The customer gets your reason and is asked to send the payment proof again.",
      confirmLabel: "Reject proof",
      tone: "danger",
      requireReason: true,
    });
    if (answer.confirmed) run(() => rejectProof(openProofId, answer.reason), "Proof rejected");
  }

  async function advance(target: "on_the_way" | "delivered") {
    const sending = target === "on_the_way";
    const answer = await confirmAction({
      title: sending ? `Send #${orderNumber} on the way?` : `Mark #${orderNumber} as delivered?`,
      text: sending ? "The customer is told it's on the way and gets a button to confirm receipt." : "The order is closed and the customer is thanked.",
      confirmLabel: sending ? "Send on the way" : "Mark delivered",
    });
    if (answer.confirmed) run(() => advanceOrder(orderId, target), sending ? "Order is on the way" : "Order delivered");
  }

  async function cancel() {
    const answer = await confirmAction({
      title: `Cancel order #${orderNumber}?`,
      text: "The customer is notified. This can't be undone.",
      confirmLabel: "Cancel order",
      tone: "danger",
      requireReason: true,
    });
    if (answer.confirmed) run(() => cancelOrder(orderId, answer.reason), "Order cancelled");
  }

  const canCancel = CANCELLABLE.includes(status);
  if (status === "delivered" || status === "cancelled") return null;

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      {status === "pending" && openProofId ? (
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={accept} disabled={isPending}><Check aria-hidden /> Accept payment</Button>
          <Button variant="outline" onClick={reject} disabled={isPending}><X aria-hidden /> Reject proof</Button>
        </div>
      ) : null}
      {status === "pending" && !openProofId ? <p className="text-xs text-fg-muted">Waiting for the customer to send a new proof.</p> : null}
      {status === "approved" ? <Button onClick={() => advance("on_the_way")} disabled={isPending}><Truck aria-hidden /> Send on the way</Button> : null}
      {status === "on_the_way" ? <Button onClick={() => advance("delivered")} disabled={isPending}><PackageCheck aria-hidden /> Mark as delivered</Button> : null}
      {canCancel ? <Button variant="danger-ghost" onClick={cancel} disabled={isPending}>Cancel order</Button> : null}
    </div>
  );
}
