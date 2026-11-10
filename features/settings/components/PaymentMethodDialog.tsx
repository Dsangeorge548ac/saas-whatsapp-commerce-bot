"use client";
/**
 * Diálogo para crear o editar un método de pago. Los campos cambian según el tipo (Pago Móvil, Zelle, USDT…).
 * Lo que se escribe aquí es lo que el bot le muestra al cliente para que pague: hay que revisarlo bien.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Field, SelectInput, TextInput } from "@/components/forms/field";
import { FormAlert, SubmitButton } from "@/components/forms/form-feedback";
import { notify } from "@/components/feedback/notify";
import { createPaymentMethod, updatePaymentMethod } from "@/features/settings/actions/payments";
import { CURRENCIES, PAYMENT_TYPES, paymentMethodSchema, type PaymentType } from "@/features/settings/schemas";

export type PaymentMethodItem = {
  id: string;
  type: PaymentType;
  label: string;
  currency: string;
  details: Record<string, string>;
  isActive: boolean;
};

export function PaymentMethodDialog({ method, children }: { method?: PaymentMethodItem; children: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<PaymentType>(method?.type ?? "pago_movil");
  const [label, setLabel] = useState(method?.label ?? "");
  const [currency, setCurrency] = useState(method?.currency ?? "USD");
  const [details, setDetails] = useState<Record<string, string>>(method?.details ?? {});
  const [isActive, setIsActive] = useState(method?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const fields = PAYMENT_TYPES.find((entry) => entry.value === type)?.fields ?? [];

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const checked = paymentMethodSchema.safeParse({ type, label, currency, details, isActive });
    if (!checked.success) return setError(checked.error.issues[0]?.message ?? "Check the fields.");
    startTransition(async () => {
      const result = method ? await updatePaymentMethod(method.id, checked.data) : await createPaymentMethod(checked.data);
      if (!result.ok) return setError(result.error);
      notify.success(method ? "Payment method updated" : "Payment method added");
      setOpen(false);
      if (!method) {
        setLabel("");
        setDetails({});
      }
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{method ? "Edit payment method" : "Add payment method"}</DialogTitle>
          <DialogDescription>The bot shows these details to the customer when it&apos;s time to pay. Double-check them.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {error ? <FormAlert>{error}</FormAlert> : null}
          <Field label="Type" required>
            {(props) => (
              <SelectInput {...props} value={type} onChange={(event) => setType(event.target.value as PaymentType)}>
                {PAYMENT_TYPES.map((entry) => (
                  <option key={entry.value} value={entry.value}>{entry.label}</option>
                ))}
              </SelectInput>
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name customers see" required>
              {(props) => <TextInput {...props} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Pago Móvil Banesco" maxLength={80} />}
            </Field>
            <Field label="Currency of the payment" required>
              {(props) => (
                <SelectInput {...props} value={currency} onChange={(event) => setCurrency(event.target.value)}>
                  {CURRENCIES.map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </SelectInput>
              )}
            </Field>
          </div>
          {fields.map(([key, fieldLabel]) => (
            <Field key={`${type}-${key}`} label={fieldLabel}>
              {(props) =>
                key === "instructions" ? (
                  <Textarea {...props} rows={3} value={details[key] ?? ""} maxLength={200} onChange={(event) => setDetails((current) => ({ ...current, [key]: event.target.value }))} />
                ) : (
                  <TextInput {...props} value={details[key] ?? ""} maxLength={200} onChange={(event) => setDetails((current) => ({ ...current, [key]: event.target.value }))} />
                )
              }
            </Field>
          ))}
          <label className="flex items-start gap-3 text-sm text-fg">
            <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} className="mt-0.5 size-4 rounded border-border accent-black" />
            <span>Active. <span className="text-fg-muted">Inactive methods are not offered to customers.</span></span>
          </label>
          <DialogFooter>
            <SubmitButton pending={isPending} className="sm:w-auto sm:px-6">{method ? "Save changes" : "Add method"}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
