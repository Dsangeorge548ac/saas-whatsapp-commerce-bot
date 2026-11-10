"use client";
/**
 * Formulario de inicio de sesión.
 * Lee ?next= (a dónde volver tras entrar); el servidor lo valida con safeNextPath
 * para evitar redirecciones a otros dominios.
 */
import { useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field, TextInput } from "@/components/forms/field";
import { FormAlert, StickyActions, SubmitButton } from "@/components/forms/form-feedback";
import { signIn } from "@/features/auth/actions/session";
import { loginSchema, type LoginInput } from "@/features/auth/schemas";

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema), mode: "onTouched" });

  function onSubmit(values: LoginInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await signIn(values, next);
      if (result && !result.ok) setServerError(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      {serverError ? <FormAlert>{serverError}</FormAlert> : null}

      <Field label="Email" error={errors.email?.message}>
        {(props) => (
          <TextInput {...props} {...register("email")} type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" autoFocus />
        )}
      </Field>

      <Field label="Password" error={errors.password?.message}>
        {(props) => <TextInput {...props} {...register("password")} type="password" autoComplete="current-password" />}
      </Field>

      <div className="-mt-2 flex justify-end">
        <Link href="/forgot-password" className="text-xs font-medium text-fg underline-offset-2 hover:underline">
          Forgot password?
        </Link>
      </div>

      <StickyActions>
        <SubmitButton pending={isPending}>Log in</SubmitButton>
      </StickyActions>
    </form>
  );
}
