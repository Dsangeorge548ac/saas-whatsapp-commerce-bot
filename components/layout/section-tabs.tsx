/**
 * Pestañas de sección (Settings, Catalog, Admin): icono + etiqueta, la activa en negro con una barra inferior de
 * 2 px y fondo suave al pasar el mouse. Una pestaña puede mostrar un punto ámbar "needs attention" (p. ej. un paso
 * de la guía pendiente), con texto accesible además del color.
 *   - Móvil: la fila se desplaza horizontalmente sin barra visible, con un degradado a la derecha que indica que
 *     hay más pestañas.
 *   - Accesibilidad: <nav> con etiqueta, aria-current="page" en la activa, foco visible.
 * Sin estado: quien la usa decide cuál está activa (por la ruta o por ?tab=), así sirve en servidor y cliente.
 */
import Link from "next/link";
import { cn } from "@/lib/utils";

export type SectionTab = { href: string; label: string; icon: React.ReactNode; active: boolean; attention?: boolean };

export function SectionTabs({ tabs, label }: { tabs: SectionTab[]; label: string }) {
  return (
    <div className="relative -mx-4 border-b border-border sm:mx-0">
      <nav aria-label={label} className="flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:px-0 [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={tab.active ? "page" : undefined}
            className={cn(
              "group relative flex shrink-0 items-center pb-2 pt-1 text-sm outline-none",
              "after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:transition-colors",
              tab.active ? "font-semibold text-fg after:bg-black" : "text-fg-muted after:bg-transparent hover:text-fg",
            )}
          >
            <span className={cn("flex h-9 items-center gap-2 rounded-md px-3 transition-colors group-focus-visible:ring-2 group-focus-visible:ring-black", !tab.active && "group-hover:bg-muted")}>
              <span className={cn("[&_svg]:size-4", tab.active ? "text-fg" : "text-fg-muted group-hover:text-fg")} aria-hidden>
                {tab.icon}
              </span>
              {tab.label}
              {tab.attention ? (
                <>
                  <span className="size-1.5 rounded-full bg-warning" aria-hidden />
                  <span className="sr-only"> (needs attention)</span>
                </>
              ) : null}
            </span>
          </Link>
        ))}
      </nav>
      {/* Indica en móvil que la fila sigue hacia la derecha. */}
      <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-surface to-transparent sm:hidden" />
    </div>
  );
}
