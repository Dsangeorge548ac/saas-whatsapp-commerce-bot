"use client";
/**
 * Formulario de registro del dueño (Paso 1).
 *
 * Campos: nombre y apellido en 2 columnas, email, nombre y tipo de comercio, contraseña +
 * confirmación y aceptación de términos. No hay teléfono: el correo ya identifica al usuario.
 * React Hook Form + Zod muestran los errores al momento; la Server Action signUp vuelve a
 * validar todo en el servidor.
 */
import { useState, useTransition } from "react";
import Link from "next/link";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field, SelectInput, TextInput } from "@/components/forms/field";
import { FormAlert, FormNote, StickyActions, SubmitButton } from "@/components/forms/form-feedback";
import { signUp } from "@/features/auth/actions/session";
import { PasswordStrength } from "@/features/auth/components/PasswordStrength";
import { BUSINESS_TYPES, inviteRegisterFormSchema, registerFormSchema, type RegisterFormInput, type RegisterFormValues } from "@/features/auth/schemas";

/** Con `inviteToken` es un operador invitado: no se piden los datos del comercio (ya existe) y el correo es el invitado. */
export function RegisterForm({ inviteToken = null, invitedEmail = null }: { inviteToken?: string | null; invitedEmail?: string | null }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<RegisterFormInput, unknown, RegisterFormValues>({
    resolver: (inviteToken ? zodResolver(inviteRegisterFormSchema) : zodResolver(registerFormSchema)) as Resolver<RegisterFormInput, unknown, RegisterFormValues>,
    defaultValues: { businessType: undefined, acceptTerms: false, ...(invitedEmail ? { email: invitedEmail } : {}) },
    mode: "onTouched",
  });

  const password = useWatch({ control, name: "password" }) ?? "";

  function onSubmit(values: RegisterFormValues) {
    setServerError(null);
    startTransition(async () => {
      const base = { firstName: values.firstName, lastName: values.lastName, email: values.email, password: values.password, acceptTerms: values.acceptTerms };
      const result = await signUp(inviteToken ? { ...base, inviteToken } : { ...base, businessName: values.businessName, businessType: values.businessType });
      if (result && !result.ok) setServerError(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      {serverError ? <FormAlert>{serverError}</FormAlert> : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="First name" required error={errors.firstName?.message}>
          {(props) => <TextInput {...props} {...register("firstName")} autoComplete="given-name" placeholder="e.g. Maria" />}
        </Field>
        <Field label="Last name" required error={errors.lastName?.message}>
          {(props) => <TextInput {...props} {...register("lastName")} autoComplete="family-name" placeholder="e.g. Rivas" />}
        </Field>
      </div>

      <Field label="Email" required error={errors.email?.message} hint={invitedEmail ? "This is the email you were invited with. The 6-digit code goes here." : undefined}>
        {(props) => (
          // Con invitación el correo es fijo (readOnly) y el servidor usa el de la invitación de todos modos.
          <TextInput {...props} {...register("email")} type="email" autoComplete={invitedEmail ? "off" : "email"} inputMode="email" placeholder="you@example.com" readOnly={Boolean(invitedEmail)} className={invitedEmail ? "text-fg-muted" : undefined} />
        )}
      </Field>

      {inviteToken ? null : (
        <>
      <Field label="Business name" required error={errors.businessName?.message} hint="This becomes your store address, e.g. luna-bakery.">
            {(props) => <TextInput {...props} {...register("businessName")} autoComplete="organization" placeholder="e.g. Luna Bakery" />}
          </Field>

          <Field label="Business type" required error={errors.businessType?.message} hint="We use it to suggest the right messages and menus. You can change it later.">
            {(props) => (
              <SelectInput {...props} {...register("businessType")} defaultValue="">
                <option value="" disabled>
                  Select your business type
                </option>
                {BUSINESS_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
        </>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Password" required error={errors.password?.message}>
          {(props) => (
            <div>
              <TextInput {...props} {...register("password")} type="password" autoComplete="new-password" placeholder="12+ characters" />
              <PasswordStrength password={password} />
            </div>
          )}
        </Field>
        <Field label="Confirm password" required error={errors.confirmPassword?.message}>
          {(props) => <TextInput {...props} {...register("confirmPassword")} type="password" autoComplete="new-password" />}
        </Field>
      </div>

      <div>
        <label className="flex items-start gap-3 text-sm text-fg">
          <input
            type="checkbox"
            {...register("acceptTerms")}
            aria-invalid={Boolean(errors.acceptTerms)}
            className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-border accent-black"
          />
          <span>
            I agree to the{" "}
            <Link href="/legal/terms" className="font-medium underline underline-offset-2">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/legal/privacy" className="font-medium underline underline-offset-2">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
        {errors.acceptTerms ? <p className="mt-1.5 text-xs text-danger-strong">{errors.acceptTerms.message}</p> : null}
      </div>

      <StickyActions>
        <SubmitButton pending={isPending}>Create account</SubmitButton>
      </StickyActions>

      <FormNote>Next, we&apos;ll verify your email with a 6-digit code.</FormNote>
    </form>
  );
}
