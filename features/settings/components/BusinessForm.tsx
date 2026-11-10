"use client";
/**
 * Formulario de "Business": nombre, tipo, moneda, zona horaria, entrega y marca (color y logo).
 * El logo se sube desde el navegador al bucket PRIVADO `branding`, dentro de la carpeta del comercio (la
 * política de Storage lo exige); la Server Action solo guarda la ruta. Validación: Zod aquí y en el servidor.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ImageOff } from "lucide-react";
import { Field, SelectInput, TextInput } from "@/components/forms/field";
import { FormAlert, SubmitButton } from "@/components/forms/form-feedback";
import { notify } from "@/components/feedback/notify";
import { BUSINESS_TYPES } from "@/features/auth/schemas";
import { updateBusiness } from "@/features/settings/actions/business";
import { CURRENCIES, businessFormSchema, type BusinessFormInput, type BusinessFormValues } from "@/features/settings/schemas";
import { createClient } from "@/lib/supabase/client";

const LOGO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

type Props = { tenantId: string; hasLogo: boolean; defaults: BusinessFormInput; timeZones: string[] };

export function BusinessForm({ tenantId, hasLogo, defaults, timeZones }: Props) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<BusinessFormInput, unknown, BusinessFormValues>({ resolver: zodResolver(businessFormSchema), defaultValues: defaults, mode: "onTouched" });

  const preview = file ? URL.createObjectURL(file) : hasLogo ? `/api/files/logo/${tenantId}` : null;

  function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] ?? null;
    setFileError(null);
    if (chosen && !(chosen.type in LOGO_TYPES)) return void setFileError("Use a JPG, PNG or WEBP image.");
    if (chosen && chosen.size > MAX_LOGO_BYTES) return void setFileError("The logo must be 2 MB or smaller.");
    setFile(chosen);
  }

  function onSubmit(values: BusinessFormValues) {
    setServerError(null);
    startTransition(async () => {
      let logoPath: string | null = null;
      if (file) {
        const path = `${tenantId}/logo/${crypto.randomUUID()}.${LOGO_TYPES[file.type]}`;
        const { error } = await createClient().storage.from("branding").upload(path, file, { contentType: file.type, upsert: false });
        if (error) return setServerError("We couldn't upload the logo. Try again.");
        logoPath = path;
      }
      const result = await updateBusiness({ ...values, deliveryFee: Number(values.deliveryFee), logoPath });
      if (!result.ok) return setServerError(result.error);
      notify.success(result.message ?? "Saved");
      setFile(null);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex max-w-2xl flex-col gap-6">
      {serverError ? <FormAlert>{serverError}</FormAlert> : null}

      <section className="flex flex-col gap-5">
        <h2 className="text-base font-semibold text-fg">Your business</h2>
        <Field label="Business name" required error={errors.name?.message} hint="Customers see it in WhatsApp and on your store page.">
          {(props) => <TextInput {...props} {...register("name")} />}
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Business type" required error={errors.businessType?.message} hint="Changes the suggested messages.">
            {(props) => (
              <SelectInput {...props} {...register("businessType")}>
                {BUSINESS_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </SelectInput>
            )}
          </Field>
          <Field label="Currency" required error={errors.currency?.message} hint="Changing it doesn't convert your prices.">
            {(props) => (
              <SelectInput {...props} {...register("currency")}>
                {CURRENCIES.map((currency) => (
                  <option key={currency} value={currency}>{currency}</option>
                ))}
              </SelectInput>
            )}
          </Field>
        </div>
        <Field label="Time zone" required error={errors.timezone?.message} hint="Used for your business hours, e.g. America/Caracas.">
          {(props) => (
            <>
              <TextInput {...props} {...register("timezone")} list="time-zones" autoComplete="off" />
              <datalist id="time-zones">
                {timeZones.map((zone) => (
                  <option key={zone} value={zone} />
                ))}
              </datalist>
            </>
          )}
        </Field>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base font-semibold text-fg">Delivery</h2>
        <label className="flex items-start gap-3 text-sm text-fg">
          <input type="checkbox" {...register("acceptsDelivery")} className="mt-0.5 size-4 rounded border-border accent-black" />
          <span>Offer delivery</span>
        </label>
        <label className="flex items-start gap-3 text-sm text-fg">
          <input type="checkbox" {...register("acceptsPickup")} className="mt-0.5 size-4 rounded border-border accent-black" />
          <span>Offer pickup at the store</span>
        </label>
        {errors.acceptsDelivery ? <p className="text-xs text-danger-strong">{errors.acceptsDelivery.message}</p> : null}
        <Field label="Delivery fee" required error={errors.deliveryFee?.message} hint="Added to the order total when the customer chooses delivery. Use 0 for free delivery.">
          {(props) => <TextInput {...props} {...register("deliveryFee")} inputMode="decimal" className="max-w-40" />}
        </Field>
        <label className="flex items-start gap-3 text-sm text-fg">
          <input type="checkbox" {...register("requireDeliveryLocation")} className="mt-0.5 size-4 rounded border-border accent-black" />
          <span>Ask for the customer&apos;s GPS location. <span className="text-fg-muted">The bot asks them to share it; turn it off to accept a written address only.</span></span>
        </label>
      </section>

      <section className="flex flex-col gap-5">
        <h2 className="text-base font-semibold text-fg">Brand</h2>
        <div className="flex items-center gap-4">
          <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-canvas">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Your logo" className="size-full object-contain" />
            ) : (
              <ImageOff className="size-5 text-chart-muted-strong" aria-hidden />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <label htmlFor="logo" className="text-xs font-medium text-fg">Logo</label>
            <input id="logo" type="file" accept="image/jpeg,image/png,image/webp" onChange={onFile} className="mt-1 block w-full text-xs text-fg-muted file:mr-3 file:h-9 file:cursor-pointer file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:text-xs file:font-medium file:text-fg" />
            <p className={fileError ? "mt-1 text-xs text-danger-strong" : "mt-1 text-xs text-fg-muted"}>{fileError ?? "JPG, PNG or WEBP, up to 2 MB."}</p>
          </div>
        </div>
        <Field label="Brand color" error={errors.accentColor?.message} hint="Optional. Colors the header of your store page, e.g. #D4F269.">
          {(props) => <TextInput {...props} {...register("accentColor")} placeholder="#D4F269" className="max-w-40" />}
        </Field>
      </section>

      <div>
        <SubmitButton pending={isPending} className="sm:w-auto sm:px-8">Save changes</SubmitButton>
      </div>
    </form>
  );
}
