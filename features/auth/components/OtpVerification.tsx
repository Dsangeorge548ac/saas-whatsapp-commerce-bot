"use client";
/**
 * Paso 2: verificación del email con un código de 6 dígitos enviado al registrarse.
 * El código lo verifica una Server Action; el navegador nunca marca nada como verificado.
 * También exporta StepCard, que reutiliza ForgotPasswordForm para que ambas pantallas se vean igual.
 */
import { useState, useTransition } from "react";
import { Check, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormAlert, SubmitButton } from "@/components/forms/form-feedback";
import { OtpInput } from "@/components/forms/otp-input";
import { resendEmailCode, verifyEmailCode } from "@/features/auth/actions/verification";
import { useCooldown } from "@/features/auth/components/useCooldown";
import { cn } from "@/lib/utils";

const RESEND_SECONDS = 60;

export function OtpVerification({ maskedEmail }: { maskedEmail: string }) {
  return (
    <StepCard
      icon={<Mail className="size-4" aria-hidden />}
      title="Email address"
      status="current"
      summary={`We sent a 6-digit code to ${maskedEmail}.`}
    >
      <EmailCodeForm />
    </StepCard>
  );
}

/**
 * Tarjeta de un paso con código: borde negro cuando es el paso actual, icono en círculo,
 * título, resumen y, dentro, los campos.
 */
export function StepCard({
  icon,
  title,
  status,
  summary,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  status: "current" | "done" | "locked";
  summary: string;
  children?: React.ReactNode;
}) {
  return (
    <section
      aria-current={status === "current" ? "step" : undefined}
      className={cn("rounded-2xl border p-5", status === "current" ? "border-black bg-surface" : "border-border bg-canvas")}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-full",
            status === "done" ? "bg-accent text-accent-foreground" : status === "current" ? "bg-black text-white" : "bg-chart-muted text-fg-muted",
          )}
        >
          {status === "done" ? <Check className="size-4" aria-hidden /> : status === "locked" ? <Lock className="size-4" aria-hidden /> : icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-fg">
            {title}
            {status === "done" ? <span className="ml-2 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">Verified</span> : null}
          </h2>
          <p className="mt-0.5 text-sm text-fg-muted">{summary}</p>
        </div>
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </section>
  );
}

function EmailCodeForm() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const cooldown = useCooldown(RESEND_SECONDS);

  function onVerify(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await verifyEmailCode({ code });
      if (result && !result.ok) {
        setError(result.error);
        setCode("");
      }
    });
  }

  function onResend() {
    setError(null);
    startTransition(async () => {
      const result = await resendEmailCode();
      if (result.ok) {
        setNotice(result.message ?? "A new code is on its way.");
        cooldown.start();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={onVerify} className="flex flex-col gap-4">
      {error ? <FormAlert>{error}</FormAlert> : null}
      {notice ? <FormAlert tone="success">{notice}</FormAlert> : null}
      <OtpInput value={code} onChange={setCode} invalid={Boolean(error)} disabled={isPending} label="Email verification code" autoFocus />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SubmitButton pending={isPending} disabled={code.length !== 6} className="sm:w-auto sm:px-6">
          Verify email
        </SubmitButton>
        <Button
          type="button"
          variant="ghost"
          onClick={onResend}
          disabled={isPending || cooldown.isCoolingDown}
          className="h-11 rounded-xl px-4 text-sm"
        >
          {cooldown.remaining > 0 ? `Resend code in ${cooldown.remaining}s` : "Resend code"}
        </Button>
      </div>
    </form>
  );
}
