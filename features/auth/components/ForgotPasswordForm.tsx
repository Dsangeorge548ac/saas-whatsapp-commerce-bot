"use client";
/**
 * Recuperar contraseña en tres pasos, en la misma pantalla y uno a la vez:
 *   1. Email → se envía un código de 6 dígitos.
 *   2. Código → el servidor lo verifica.
 *   3. Nueva contraseña (solo aparece cuando el código es válido).
 * El email solo vive en el estado de este componente (lo escribió el propio usuario);
 * nunca va en la URL.
 */
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CircleCheck, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/forms/field";
import { FormAlert, StickyActions, SubmitButton } from "@/components/forms/form-feedback";
import { OtpInput } from "@/components/forms/otp-input";
import { requestPasswordReset, setNewPassword, verifyRecoveryCode } from "@/features/auth/actions/password";
import { StepCard } from "@/features/auth/components/OtpVerification";
import { PasswordStrength } from "@/features/auth/components/PasswordStrength";
import { useCooldown } from "@/features/auth/components/useCooldown";
import { forgotPasswordSchema, passwordSchema, type ForgotPasswordInput } from "@/features/auth/schemas";
import { maskEmail } from "@/lib/auth/mask";

type Step = { name: "email" } | { name: "code"; email: string } | { name: "password"; email: string };

export function ForgotPasswordForm() {
  const [step, setStep] = useState<Step>({ name: "email" });

  if (step.name === "email") return <EmailStep onSent={(email) => setStep({ name: "code", email })} />;
  if (step.name === "code") {
    return (
      <CodeStep
        email={step.email}
        onVerified={() => setStep({ name: "password", email: step.email })}
        onChangeEmail={() => setStep({ name: "email" })}
      />
    );
  }
  return <PasswordStep email={step.email} />;
}

/** Indicador "Paso X de 3" para que el usuario sepa dónde está. */
function StepLabel({ current }: { current: 1 | 2 | 3 }) {
  return (
    <p className="text-xs font-medium text-fg-muted">
      Step {current} of 3 · {current === 1 ? "Your email" : current === 2 ? "Verification code" : "New password"}
    </p>
  );
}

function EmailStep({ onSent }: { onSent: (email: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { register, handleSubmit, formState: { errors } } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    mode: "onTouched",
  });

  function onSubmit(values: ForgotPasswordInput) {
    setError(null);
    startTransition(async () => {
      const result = await requestPasswordReset(values);
      if (result.ok) onSent(values.email);
      else setError(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      <StepLabel current={1} />
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Field label="Email" error={errors.email?.message}>
        {(props) => <TextInput {...props} {...register("email")} type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" autoFocus />}
      </Field>
      <StickyActions>
        <SubmitButton pending={isPending}>Send code</SubmitButton>
      </StickyActions>
    </form>
  );
}

function CodeStep({ email, onVerified, onChangeEmail }: { email: string; onVerified: () => void; onChangeEmail: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const cooldown = useCooldown(60);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await verifyRecoveryCode({ email, code });
      if (result.ok) onVerified();
      else {
        setError(result.error);
        setCode("");
      }
    });
  }

  function onResend() {
    setError(null);
    startTransition(async () => {
      const result = await requestPasswordReset({ email });
      if (result.ok) {
        setNotice(result.message ?? null);
        cooldown.start();
      } else setError(result.error);
    });
  }

  // Mismo diseño que "Verify your email": tarjeta con borde negro y los 6 campos dentro.
  return (
    <div className="flex flex-col gap-5">
      <StepLabel current={2} />
      <StepCard
        icon={<KeyRound className="size-4" aria-hidden />}
        title="Password reset code"
        status="current"
        summary={`If an account exists for ${maskEmail(email)}, we sent a 6-digit code.`}
      >
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {error ? <FormAlert>{error}</FormAlert> : notice ? <FormAlert tone="success">{notice}</FormAlert> : null}
          <OtpInput value={code} onChange={setCode} invalid={Boolean(error)} disabled={isPending} label="Password reset code" autoFocus />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <SubmitButton pending={isPending} disabled={code.length !== 6} className="sm:w-auto sm:px-6">
              Verify code
            </SubmitButton>
            <Button type="button" variant="ghost" onClick={onResend} disabled={isPending || cooldown.isCoolingDown} className="h-11 px-4 text-sm">
              {cooldown.isCoolingDown ? `Resend code in ${cooldown.remaining}s` : "Resend code"}
            </Button>
          </div>
        </form>
      </StepCard>
      <button type="button" onClick={onChangeEmail} className="self-start text-xs font-medium text-fg-muted underline-offset-2 hover:underline">
        Use a different email
      </button>
    </div>
  );
}

const passwordFormSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((data) => data.password === data.confirmPassword, { path: ["confirmPassword"], message: "Passwords don't match." });
type PasswordFormValues = z.infer<typeof passwordFormSchema>;

function PasswordStep({ email }: { email: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { register, handleSubmit, control, formState: { errors } } = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordFormSchema),
    mode: "onTouched",
  });
  const password = useWatch({ control, name: "password" }) ?? "";

  function onSubmit(values: PasswordFormValues) {
    setError(null);
    startTransition(async () => {
      const result = await setNewPassword(values);
      if (result && !result.ok) setError(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      <StepLabel current={3} />
      {error ? (
        <FormAlert>{error}</FormAlert>
      ) : (
        <p className="flex items-center gap-2 text-sm text-fg">
          <CircleCheck className="size-4 text-success" aria-hidden /> Code verified for {maskEmail(email)}. Choose a new password.
        </p>
      )}
      <Field label="New password" error={errors.password?.message}>
        {(props) => (
          <div>
            <TextInput {...props} {...register("password")} type="password" autoComplete="new-password" placeholder="12+ characters" autoFocus />
            <PasswordStrength password={password} />
          </div>
        )}
      </Field>
      <Field label="Confirm new password" error={errors.confirmPassword?.message}>
        {(props) => <TextInput {...props} {...register("confirmPassword")} type="password" autoComplete="new-password" />}
      </Field>
      <StickyActions>
        <SubmitButton pending={isPending}>Update password</SubmitButton>
      </StickyActions>
    </form>
  );
}
