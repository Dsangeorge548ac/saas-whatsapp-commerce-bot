"use client";
/**
 * Diálogo de las acciones del staff (mismo patrón que AdminEditDialog de Tax Pro): botón que lo abre, título,
 * descripción, campos propios de la acción (children), motivo OBLIGATORIO (queda en la auditoría) y confirmar.
 * Muestra el error del servidor dentro del diálogo; al terminar bien, avisa, cierra y refresca la página.
 * Es solo UI: cada Server Action vuelve a validar sesión, rol y datos.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { notify } from "@/components/feedback/notify";
import { FormAlert } from "@/components/forms/form-feedback";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { ActionResult } from "@/features/auth/schemas";

type Variant = "default" | "outline" | "destructive" | "danger-ghost";

type Props = {
  triggerLabel: string;
  triggerVariant?: Variant;
  title: string;
  description: string;
  confirmLabel: string;
  confirmVariant?: "default" | "destructive";
  /** Deshabilita confirmar (p. ej. mientras el formulario es inválido). */
  disabled?: boolean;
  onSave: (reason: string) => Promise<ActionResult>;
  children?: React.ReactNode;
};

export function AdminActionDialog({ triggerLabel, triggerVariant = "outline", title, description, confirmLabel, confirmVariant = "default", disabled, onSave, children }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setError(null);
    if (reason.trim().length < 3) return setError("Write a reason (at least 3 characters).");
    start(async () => {
      const result = await onSave(reason.trim());
      if (!result.ok) return setError(result.error);
      notify.success(result.message ?? "Saved");
      setOpen(false);
      setReason("");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!pending) { setOpen(next); setError(null); } }}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size="sm">{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {children}
          <label className="flex flex-col gap-1.5 text-xs font-medium text-fg">
            Reason (saved in the audit log)
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={300}
              rows={3}
              placeholder="Why are you doing this?"
              className="rounded-lg border border-border bg-surface p-3 text-sm font-normal text-fg outline-none focus:border-black"
            />
          </label>
          {error ? <FormAlert>{error}</FormAlert> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button variant={confirmVariant} onClick={save} disabled={pending || disabled}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Opción seleccionable dentro de un diálogo (radio con estilo de tarjeta). */
export function OptionCard({ selected, onSelect, title, text, aside }: { selected: boolean; onSelect: () => void; title: string; text?: string; aside?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:ring-black ${selected ? "border-black bg-canvas" : "border-border bg-surface hover:bg-muted"}`}
    >
      <span>
        <span className="block font-medium text-fg">{title}</span>
        {text ? <span className="mt-0.5 block text-xs text-fg-muted">{text}</span> : null}
      </span>
      {aside ? <span className="shrink-0 text-fg-muted">{aside}</span> : null}
    </button>
  );
}
