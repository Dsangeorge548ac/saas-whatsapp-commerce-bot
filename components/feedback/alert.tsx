/**
 * Alerta en línea (banner) de Tax Pro.
 *
 * Tonos: info (gris), success (verde), warning (ámbar), danger (rojo) y accent (lima, para
 * invitar a una acción positiva, por ejemplo "Complete your setup").
 * Diseño: fondo suave del color + borde + icono de color; el TEXTO siempre es oscuro,
 * porque verde, ámbar y rojo sobre blanco no tienen contraste suficiente para leer.
 * El estado nunca se comunica solo con color: siempre hay icono y texto.
 *
 * Accesibilidad: danger/warning usan role="alert" (se anuncian al aparecer);
 * el resto, role="status".
 */
import { CircleAlert, CircleCheck, Info, Sparkles, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type AlertTone = "info" | "success" | "warning" | "danger" | "accent";

const TONES: Record<AlertTone, { container: string; icon: string; Icon: typeof Info }> = {
  info: { container: "border-border bg-canvas", icon: "text-fg-muted", Icon: Info },
  success: { container: "border-success/30 bg-success/10", icon: "text-success", Icon: CircleCheck },
  warning: { container: "border-warning/40 bg-warning/10", icon: "text-warning", Icon: TriangleAlert },
  danger: { container: "border-danger/30 bg-danger/10", icon: "text-danger-strong", Icon: CircleAlert },
  accent: { container: "border-accent bg-accent/25", icon: "text-black", Icon: Sparkles },
};

type AlertProps = {
  tone?: AlertTone;
  title: string;
  children?: React.ReactNode;
  /** Botones o enlaces de acción (por ejemplo, un <Button size="sm">). */
  action?: React.ReactNode;
  /** Si se pasa, muestra la X para cerrar. */
  onDismiss?: () => void;
  className?: string;
};

export function Alert({ tone = "info", title, children, action, onDismiss, className }: AlertProps) {
  const { container, icon, Icon } = TONES[tone];

  return (
    <div
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
      className={cn("flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center", container, className)}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Icon className={cn("mt-0.5 size-5 shrink-0", icon)} aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-fg">{title}</p>
          {children ? <div className="mt-0.5 text-sm text-fg/80">{children}</div> : null}
        </div>
      </div>
      {action || onDismiss ? (
        <div className="flex shrink-0 items-center gap-2 pl-8 sm:pl-0">
          {action}
          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              className="grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-black/5 hover:text-fg focus-visible:ring-2 focus-visible:ring-black"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
