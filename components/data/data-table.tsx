/**
 * Piezas comunes de las tablas (mismo estilo en toda la app):
 *   - TableCard: tarjeta blanca con borde y radio de 8 px; la tabla se desplaza horizontalmente si no cabe.
 *   - Clases de encabezado, fila y celda: encabezado gris claro en mayúsculas pequeñas, filas con hover suave.
 *   - EmptyState: mensaje centrado cuando no hay filas (título + ayuda + acción opcional).
 *   - Pagination: resultados y página actual a la izquierda; Previous / Next a la derecha (deshabilitados en los
 *     extremos). Los enlaces conservan el resto de filtros de la URL.
 * Sin estado: sirven en Server y Client Components.
 */
import Link from "next/link";
import { ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export const theadClass = "border-b border-border bg-canvas";
export const thClass = "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-fg-muted";
export const rowClass = "transition-colors hover:bg-canvas/70";
export const tdClass = "px-4 py-3 align-middle";

export function TableCard({ children, minWidth = "40rem", className }: { children: React.ReactNode; minWidth?: string; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-lg border border-border bg-surface", className)}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth }}>
          {children}
        </table>
      </div>
    </div>
  );
}

export function EmptyState({ title, text, action, icon: Icon = Inbox }: { title: string; text?: string; action?: React.ReactNode; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface px-6 py-14 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-canvas text-fg-muted">
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="text-sm font-medium text-fg">{title}</p>
      {text ? <p className="max-w-sm text-sm text-fg-muted">{text}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

type PaginationProps = {
  page: number;
  pageCount: number;
  total: number;
  /** Palabra para el total ("orders", "users"…). */
  noun: string;
  /** URL de una página (conserva los filtros). */
  href: (page: number) => string;
};

const pageLinkClass = "inline-flex h-9 items-center gap-1 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-fg transition-colors hover:bg-muted";

export function Pagination({ page, pageCount, total, noun, href }: PaginationProps) {
  if (total === 0) return null;
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 text-sm text-fg-muted">
      <span>
        <span className="font-medium text-fg">{total.toLocaleString("en-US")}</span> {noun}
        {pageCount > 1 ? ` · page ${page} of ${pageCount}` : ""}
      </span>
      {pageCount > 1 ? (
        <div className="flex gap-2">
          {page > 1 ? (
            <Link href={href(page - 1)} scroll={false} className={pageLinkClass}><ChevronLeft className="size-4" aria-hidden /> Previous</Link>
          ) : (
            <span aria-disabled className={cn(pageLinkClass, "pointer-events-none opacity-40")}><ChevronLeft className="size-4" aria-hidden /> Previous</span>
          )}
          {page < pageCount ? (
            <Link href={href(page + 1)} scroll={false} className={pageLinkClass}>Next <ChevronRight className="size-4" aria-hidden /></Link>
          ) : (
            <span aria-disabled className={cn(pageLinkClass, "pointer-events-none opacity-40")}>Next <ChevronRight className="size-4" aria-hidden /></span>
          )}
        </div>
      ) : null}
    </nav>
  );
}
