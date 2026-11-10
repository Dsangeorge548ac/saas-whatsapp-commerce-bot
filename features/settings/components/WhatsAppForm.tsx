"use client";
/**
 * Formulario para conectar el número de WhatsApp del comercio (ID de la cuenta, ID del número y token).
 * Las credenciales se comprueban en Meta y el token se guarda cifrado en el servidor; esta pantalla nunca
 * vuelve a mostrar el token. Al conectar bien, el campo se vacía.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Field, TextInput } from "@/components/forms/field";
import { FormAlert, SubmitButton } from "@/components/forms/form-feedback";
import { notify } from "@/components/feedback/notify";
import { connectWhatsApp } from "@/features/settings/actions/whatsapp";

const formSchema = z.object({
  wabaId: z.string().trim().regex(/^\d{5,30}$/, "Only digits, e.g. 104523998877665."),
  phoneNumberId: z.string().trim().regex(/^\d{5,30}$/, "Only digits, e.g. 109876543210987."),
  token: z.string().trim().min(20, "Paste the full access token."),
});

export function WhatsAppForm({ connected }: { connected: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState({ wabaId: "", phoneNumberId: "", token: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof values, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setServerError(null);
    const checked = formSchema.safeParse(values);
    if (!checked.success) {
      const next: typeof errors = {};
      for (const issue of checked.error.issues) next[issue.path[0] as keyof typeof values] ??= issue.message;
      return setErrors(next);
    }
    setErrors({});
    startTransition(async () => {
      const result = await connectWhatsApp(checked.data);
      if (!result.ok) return setServerError(result.error);
      notify.success(result.message ?? "Connected");
      setValues((current) => ({ ...current, token: "" })); // el token no se queda en pantalla
      router.refresh();
    });
  }

  const set = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement>) => setValues((current) => ({ ...current, [key]: event.target.value }));

  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-xl flex-col gap-5">
      {serverError ? <FormAlert>{serverError}</FormAlert> : null}
      <Field label="WhatsApp Business Account ID" required error={errors.wabaId} hint="Meta Business → WhatsApp accounts.">
        {(props) => <TextInput {...props} value={values.wabaId} onChange={set("wabaId")} inputMode="numeric" autoComplete="off" />}
      </Field>
      <Field label="Phone number ID" required error={errors.phoneNumberId} hint="The ID of your business number (not the phone number itself).">
        {(props) => <TextInput {...props} value={values.phoneNumberId} onChange={set("phoneNumberId")} inputMode="numeric" autoComplete="off" />}
      </Field>
      <Field label={connected ? "New access token" : "Access token"} required error={errors.token} hint={connected ? "Paste a new token to replace the current one. It is stored encrypted and never shown again." : "A permanent token with WhatsApp permissions. It is stored encrypted and never shown again."}>
        {(props) => <TextInput {...props} value={values.token} onChange={set("token")} type="password" autoComplete="off" spellCheck={false} />}
      </Field>
      <div>
        <SubmitButton pending={isPending} className="sm:w-auto sm:px-8">{connected ? "Update connection" : "Connect WhatsApp"}</SubmitButton>
      </div>
    </form>
  );
}
