"use client";
/**
 * Fila de un método de pago con sus acciones (editar y borrar con confirmación). Solo el dueño la ve;
 * las Server Actions vuelven a comprobarlo.
 */
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/layout/status-badge";
import { confirmAction } from "@/components/feedback/sweet-confirm";
import { notify } from "@/components/feedback/notify";
import { deletePaymentMethod } from "@/features/settings/actions/payments";
import { PaymentMethodDialog, type PaymentMethodItem } from "@/features/settings/components/PaymentMethodDialog";
import { PAYMENT_TYPES } from "@/features/settings/schemas";

export function PaymentMethodRow({ method }: { method: PaymentMethodItem }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const typeLabel = PAYMENT_TYPES.find((entry) => entry.value === method.type)?.label ?? method.type;

  async function remove() {
    const answer = await confirmAction({
      title: `Delete "${method.label}"?`,
      text: "Customers won't be offered it anymore. Past orders keep the payment details they were given.",
      confirmLabel: "Delete method",
      tone: "danger",
    });
    if (!answer.confirmed) return;
    startTransition(async () => {
      const result = await deletePaymentMethod(method.id);
      if (!result.ok) return notify.error(result.error);
      notify.success("Payment method deleted");
      router.refresh();
    });
  }

  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-canvas text-fg">
        <Wallet className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
          <span className="truncate">{method.label}</span>
          <StatusBadge tone={method.isActive ? "success" : "neutral"}>{method.isActive ? "Active" : "Inactive"}</StatusBadge>
        </p>
        <p className="text-xs text-fg-muted">{typeLabel} · {method.currency}</p>
      </div>
      <PaymentMethodDialog method={method}>
        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${method.label}`} title="Edit"><Pencil aria-hidden /></Button>
      </PaymentMethodDialog>
      <Button variant="ghost" size="icon-sm" onClick={remove} disabled={isPending} aria-label={`Delete ${method.label}`} title="Delete"><Trash2 aria-hidden /></Button>
    </li>
  );
}
