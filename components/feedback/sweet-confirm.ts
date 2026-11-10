"use client";
/**
 * Confirmación de operaciones con SweetAlert2 (regla del proyecto: TODA operación que cambie
 * datos se confirma antes de enviarse al servidor).
 *
 * Quién lo usa: ConfirmDialog, AdminEditDialog y cualquier formulario que guarde, borre,
 * cancele, pague o cierre sesión. No se usa en login, registro ni códigos OTP.
 *
 * - confirmAction(): solo pregunta. Devuelve { confirmed, reason }.
 * - confirmAndRun(): pregunta y, al confirmar, ejecuta la Server Action con el spinner de
 *   SweetAlert. Si el servidor responde con error, lo muestra dentro del mismo diálogo.
 *
 * Seguridad: los textos se pasan como texto plano (titleText / text), nunca como HTML,
 * porque pueden incluir nombres o emails de usuarios (evita inyección de HTML/XSS).
 * Esto es solo UI: cada Server Action vuelve a validar sesión, rol y datos.
 */
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/features/auth/schemas";

export type ConfirmOptions = {
  title: string;
  text?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger": icono de advertencia y botón rojo, para acciones irreversibles. */
  tone?: "default" | "danger";
  /** Pide un motivo obligatorio (mínimo 3 caracteres), por ejemplo para la auditoría. */
  requireReason?: boolean;
};

export type ConfirmResult = { confirmed: false } | { confirmed: true; reason?: string };

/** Clases del diálogo: mismos tokens del sistema de diseño (radio 8px, botones de shadcn). */
function swalClasses(tone: ConfirmOptions["tone"]) {
  return {
    popup: "!rounded-lg !border !border-border !bg-surface !p-6 !shadow-lg",
    title: "!p-0 !text-base !font-semibold !text-fg",
    htmlContainer: "!mx-0 !mt-2 !p-0 !text-sm !text-fg-muted",
    actions: "!mt-6 !w-full !justify-end !gap-2",
    confirmButton: cn(buttonVariants({ variant: tone === "danger" ? "destructive" : "default" })),
    cancelButton: cn(buttonVariants({ variant: "outline" })),
    input: "!mx-0 !mt-4 !rounded-lg !border !border-border !text-sm !shadow-none focus:!border-black",
    validationMessage: "!mx-0 !mt-3 !rounded-lg !bg-danger/10 !text-sm !text-danger-strong",
    icon: "!mt-0 !mb-4",
  };
}

/** Carga SweetAlert2 solo cuando se necesita (no pesa en la carga inicial de la página). */
async function loadSwal() {
  const { default: Swal } = await import("sweetalert2");
  return Swal;
}

function baseOptions(options: ConfirmOptions) {
  return {
    titleText: options.title,
    text: options.text,
    icon: options.tone === "danger" ? ("warning" as const) : ("question" as const),
    showCancelButton: true,
    confirmButtonText: options.confirmLabel ?? "Confirm",
    cancelButtonText: options.cancelLabel ?? "Cancel",
    reverseButtons: true,
    focusCancel: options.tone === "danger",
    buttonsStyling: false,
    customClass: swalClasses(options.tone),
    ...(options.requireReason
      ? {
          input: "textarea" as const,
          inputLabel: "Reason (saved in the audit log)",
          inputPlaceholder: "Why are you doing this?",
          // Regla de negocio: las acciones auditadas exigen un motivo de al menos 3 caracteres.
          inputValidator: (value: string) => (value.trim().length < 3 ? "Write a reason (at least 3 characters)." : null),
        }
      : {}),
  };
}

/** Pregunta y devuelve si el usuario confirmó (y el motivo, si se pidió). */
export async function confirmAction(options: ConfirmOptions): Promise<ConfirmResult> {
  const Swal = await loadSwal();
  const result = await Swal.fire(baseOptions(options));
  if (!result.isConfirmed) return { confirmed: false };
  return { confirmed: true, reason: typeof result.value === "string" ? result.value.trim() : undefined };
}

/**
 * Pregunta y, si confirma, ejecuta `action` mostrando el spinner en el botón.
 * Devuelve el resultado de la acción, o null si el usuario canceló.
 * Si la acción falla, el error se muestra en el diálogo y el usuario puede reintentar o cancelar.
 */
export async function confirmAndRun(
  options: ConfirmOptions,
  action: (reason?: string) => Promise<ActionResult>,
): Promise<ActionResult | null> {
  const Swal = await loadSwal();
  let lastResult: ActionResult | null = null;

  const result = await Swal.fire({
    ...baseOptions(options),
    showLoaderOnConfirm: true,
    allowOutsideClick: () => !Swal.isLoading(),
    allowEscapeKey: () => !Swal.isLoading(),
    preConfirm: async (value: unknown) => {
      const reason = typeof value === "string" ? value.trim() : undefined;
      try {
        lastResult = await action(reason);
      } catch {
        Swal.showValidationMessage("Something went wrong. Please try again.");
        return false;
      }
      if (!lastResult.ok) {
        Swal.showValidationMessage(lastResult.error);
        return false;
      }
      return true;
    },
  });

  return result.isConfirmed ? lastResult : null;
}

/**
 * Para formularios dentro de un Dialog de Radix: el Dialog atrapa el foco y no dejaría usar
 * SweetAlert, así que se oculta mientras se pregunta y se vuelve a abrir después (el estado
 * del formulario vive fuera del contenido, así que no se pierde lo escrito).
 * Si confirma, la acción se ejecuta con el Dialog abierto para mostrar el progreso y errores.
 */
export async function confirmFromDialog(setOpen: (open: boolean) => void, options: ConfirmOptions): Promise<ConfirmResult> {
  setOpen(false);
  const answer = await confirmAction(options);
  setOpen(true);
  return answer;
}
