/**
 * Marcador de un módulo que aún no está construido (Orders, Chats, Catalog…).
 * Mantiene la navegación y la compuerta de suscripción funcionando mientras se desarrollan.
 */
import type { LucideIcon } from "lucide-react";

export function ComingSoon({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-accent text-accent-foreground">
        <Icon className="size-6" aria-hidden />
      </span>
      <h1 className="mt-6 text-2xl font-medium tracking-tight text-fg">{title}</h1>
      <p className="mt-2 text-sm text-fg-muted">{description}</p>
      <span className="mt-6 rounded-full bg-muted px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-fg-muted">Coming soon</span>
    </div>
  );
}
