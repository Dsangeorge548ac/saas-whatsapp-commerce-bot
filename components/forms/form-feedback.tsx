/**
 * Piezas comunes de los formularios:
 * - FormAlert: mensaje de error o de éxito del envío, anunciado a lectores de pantalla.
 * - SubmitButton: botón principal negro con estado de carga (evita doble envío).
 * - FormNote: nota informativa con icono (como "Our team usually replies…" de la referencia).
 */
import { CircleAlert, CircleCheck, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Versión compacta de <Alert> para el resultado de un formulario (mismos colores y criterio). */
export function FormAlert({ tone = "error", children }: { tone?: "error" | "success"; children: React.ReactNode }) {
  const Icon = tone === "error" ? CircleAlert : CircleCheck;
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm text-fg",
        tone === "error" ? "border-danger/30 bg-danger/10" : "border-success/30 bg-success/10",
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", tone === "error" ? "text-danger-strong" : "text-success")} aria-hidden />
      <span>{children}</span>
    </p>
  );
}

export function SubmitButton({
  pending,
  children,
  className,
  ...props
}: React.ComponentProps<typeof Button> & { pending: boolean }) {
  return (
    <Button
      type="submit"
      disabled={pending || props.disabled}
      aria-busy={pending}
      className={cn("h-12 w-full rounded-xl text-sm sm:h-11", className)}
      {...props}
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {children}
    </Button>
  );
}

export function FormNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-xs text-fg-muted">
      <Info className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/**
 * Contenedor del botón principal: en móvil queda fijo abajo (sticky) con sombra,
 * como pide la skill design-system; en pantallas grandes es un bloque normal.
 */
export function StickyActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-5 border-t border-border bg-surface px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgb(0_0_0/0.04)] sm:static sm:mx-0 sm:border-0 sm:p-0 sm:shadow-none">
      {children}
    </div>
  );
}
