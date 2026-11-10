/**
 * Control segmentado (pestañas en píldora) para filtros y vistas: un solo contenedor gris con las opciones; la
 * activa queda blanca con sombra. Se desplaza horizontalmente en móvil. Lo usan TableToolbar (filtros en la URL) y
 * las páginas que cambian de vista con enlaces (p. ej. Orders: Board / History). Sin estado: sirve en servidor.
 */
import Link from "next/link";
import { cn } from "@/lib/utils";

export const segmentedGroupClass = "inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-border bg-canvas p-1";

export function segmentedItemClass(active: boolean) {
  return cn(
    "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-black",
    active ? "bg-surface font-semibold text-fg shadow-sm" : "text-fg-muted hover:text-fg",
  );
}

/** Contador pequeño junto a la etiqueta (p. ej. "Unread 3"). */
export function SegmentCount({ value, active }: { value: number; active: boolean }) {
  return <span className={cn("rounded-full px-1.5 text-[11px] font-semibold tabular-nums", active ? "bg-black text-white" : "bg-chart-muted text-fg-muted")}>{value}</span>;
}

export type SegmentLink = { href: string; label: string; active: boolean; count?: number };

/** Versión con enlaces (navegación entre vistas). */
export function SegmentedLinks({ items, label }: { items: SegmentLink[]; label: string }) {
  return (
    <nav aria-label={label} className={segmentedGroupClass}>
      {items.map((item) => (
        <Link key={item.href} href={item.href} aria-current={item.active ? "page" : undefined} className={segmentedItemClass(item.active)}>
          {item.label}
          {item.count !== undefined ? <SegmentCount value={item.count} active={item.active} /> : null}
        </Link>
      ))}
    </nav>
  );
}
