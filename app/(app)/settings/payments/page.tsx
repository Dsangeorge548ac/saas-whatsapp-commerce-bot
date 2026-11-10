/**
 * /settings/payments — Cómo cobras: los datos que el bot le muestra al cliente para pagar. GRATIS.
 */
import { Suspense } from "react";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaymentMethodDialog, type PaymentMethodItem } from "@/features/settings/components/PaymentMethodDialog";
import { PaymentMethodRow } from "@/features/settings/components/PaymentMethodRow";
import type { PaymentType } from "@/features/settings/schemas";
import { currentMembership, requireWorkspace } from "@/lib/data/workspace";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Payment methods" };

export default function PaymentsPage() {
  return (
    <Suspense fallback={<div className="h-72 animate-pulse rounded-lg bg-canvas" aria-busy="true" />}>
      <PaymentsContent />
    </Suspense>
  );
}

async function PaymentsContent() {
  const membership = currentMembership(await requireWorkspace());
  if (!membership) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("tenant_payment_methods")
    .select("id, type, label, currency, details, is_active")
    .eq("tenant_id", membership.tenant_id)
    .order("sort_order")
    .order("created_at");

  const methods: PaymentMethodItem[] = (data ?? []).map((row) => ({
    id: row.id,
    type: row.type as PaymentType,
    label: row.label,
    currency: row.currency,
    details: Object.fromEntries(Object.entries((row.details ?? {}) as Record<string, unknown>).filter(([, value]) => typeof value === "string")) as Record<string, string>,
    isActive: row.is_active,
  }));

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-md text-sm text-fg-muted">Add at least one active method. The bot shows it to the customer after they confirm their order.</p>
        <PaymentMethodDialog>
          <Button><Plus aria-hidden /> Add method</Button>
        </PaymentMethodDialog>
      </div>
      {methods.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-14 text-center">
          <p className="text-sm font-medium text-fg">No payment methods yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-fg-muted">Add Pago Móvil, a bank transfer, Zelle or USDT so customers know where to pay.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {methods.map((method) => (
            <PaymentMethodRow key={method.id} method={method} />
          ))}
        </ul>
      )}
    </div>
  );
}
