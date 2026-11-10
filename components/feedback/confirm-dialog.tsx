"use client";
/**
 * Botón con confirmación (SweetAlert2) para acciones importantes o irreversibles
 * (cerrar sesión en todos los dispositivos, aprobar, retirar una solicitud…).
 *
 * Quién lo usa: SecurityView, VerificationView, ReviewActions, ui-kit.
 * - tone="danger": icono de advertencia y botón de confirmar rojo oscuro.
 * - tone="default": botón negro.
 * - requireReason: obliga a escribir un motivo (acciones de admin que quedan auditadas).
 * El diálogo lo dibuja confirmAction() (components/feedback/sweet-confirm.ts).
 * Es solo UI: la Server Action que se llama en onConfirm vuelve a validar todo.
 */
import { useState } from "react";
import { Slot } from "radix-ui";
import { confirmAction } from "@/components/feedback/sweet-confirm";

type ConfirmDialogProps = {
  /** Botón que abre la confirmación (normalmente un <Button>). */
  trigger: React.ReactNode;
  title: string;
  /** Texto plano (no HTML): se muestra tal cual en el diálogo. */
  description: string;
  confirmLabel: string;
  tone?: "default" | "danger";
  requireReason?: boolean;
  onConfirm: (reason?: string) => Promise<void> | void;
};

export function ConfirmDialog({ trigger, title, description, confirmLabel, tone = "default", requireReason, onConfirm }: ConfirmDialogProps) {
  const [isWorking, setIsWorking] = useState(false);

  async function handleClick() {
    // Evita abrir dos confirmaciones si el usuario hace doble clic.
    if (isWorking) return;
    const answer = await confirmAction({ title, text: description, confirmLabel, tone, requireReason });
    if (!answer.confirmed) return;

    setIsWorking(true);
    try {
      await onConfirm(requireReason ? answer.reason : undefined);
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <Slot.Root onClick={handleClick} aria-busy={isWorking} data-disabled={isWorking || undefined}>
      {trigger}
    </Slot.Root>
  );
}
