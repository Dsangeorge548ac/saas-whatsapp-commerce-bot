"use client";
/**
 * Invitar a un operador por correo. Se genera un enlace de UN solo uso (vence a los 7 días) que el dueño
 * copia y le manda a la persona; el enlace se muestra una sola vez (en la base solo queda su hash).
 * Requiere plan vigente y cupo en el plan: si no, se explica con un mensaje claro y un enlace a Billing.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormAlert, SubmitButton } from "@/components/forms/form-feedback";
import { notify } from "@/components/feedback/notify";
import { inviteOperator } from "@/features/team/actions";

export function InviteForm({ disabledReason }: { disabledReason: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLink(null);
    startTransition(async () => {
      const result = await inviteOperator(email);
      if (!result.ok) return setError(result.error);
      setLink(result.link ?? null);
      setEmail("");
      router.refresh();
    });
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      notify.success("Invitation link copied");
    } catch {
      notify.error("We couldn't copy it. Select the link and copy it manually.");
    }
  }

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex-1">
          <span className="text-xs font-medium text-fg">Operator&apos;s email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={Boolean(disabledReason) || isPending}
            placeholder="operator@example.com"
            autoComplete="off"
            className="mt-1 h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-black disabled:opacity-60"
          />
        </label>
        <SubmitButton pending={isPending} disabled={Boolean(disabledReason) || email.trim() === ""} className="sm:w-auto sm:px-6">Create invitation</SubmitButton>
      </form>
      {disabledReason ? <p className="text-xs text-fg-muted">{disabledReason}</p> : null}
      {error ? <FormAlert>{error}</FormAlert> : null}
      {link ? (
        <div className="rounded-lg border border-border bg-canvas p-3">
          <p className="text-xs font-medium text-fg">Send this link to your operator. It works once and expires in 7 days. It won&apos;t be shown again.</p>
          <div className="mt-2 flex items-center gap-2">
            <input readOnly value={link} aria-label="Invitation link" onFocus={(event) => event.currentTarget.select()} className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 text-xs" />
            <Button type="button" variant="outline" size="sm" onClick={copy}><Copy aria-hidden /> Copy</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
