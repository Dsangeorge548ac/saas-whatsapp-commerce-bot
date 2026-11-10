"use client";
/**
 * Barra de filtros de las tablas (mismo criterio que Tax Pro): todo vive en la URL (?q=…&status=…), así se puede
 * compartir el enlace, recargar o usar "atrás". Cada cambio vuelve a la página 1.
 *
 *   [ All | Active | … ]                      [ 🔍 Search…        ×]  [ Plan ▾ ]  [acción]
 *
 *   - Pestañas (control segmentado) a la izquierda; búsqueda, selects y la acción principal a la derecha.
 *   - La búsqueda se aplica sola 350 ms después de la última tecla (sin botón "Search"); la X la borra.
 *   - Todos los controles miden lo mismo (h-10, radio de 8 px). En móvil se apilan y ocupan el ancho completo.
 *   - "Clear filters" aparece solo si hay algún filtro aplicado.
 * Solo construye la URL: cada página valida los parámetros con Zod y consulta en el servidor.
 */
import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Loader2, Search, X } from "lucide-react";
import { SegmentCount, segmentedGroupClass, segmentedItemClass } from "@/components/data/segmented";
import { cn } from "@/lib/utils";

export type ToolbarTabs = { name: string; defaultValue: string; label: string; items: { value: string; label: string; count?: number }[] };
export type ToolbarSelect = { name: string; label: string; allLabel: string; allValue?: string; options: { value: string; label: string }[] };

type Props = {
  tabs?: ToolbarTabs;
  search?: { name?: string; placeholder: string };
  selects?: ToolbarSelect[];
  /** Acción principal de la tabla (p. ej. "Add product"), alineada a la derecha. */
  action?: React.ReactNode;
  /** Parámetros que siempre se conservan aunque se limpien los filtros (p. ej. tab=products, view=history). */
  keep?: string[];
};

export function TableToolbar({ tabs, search, selects = [], action, keep = [] }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const searchName = search?.name ?? "q";
  const [text, setText] = useState(params.get(searchName) ?? "");

  function apply(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page");
    start(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  }

  useEffect(() => {
    if (!search || text.trim() === (params.get(searchName) ?? "")) return;
    const timer = setTimeout(() => apply({ [searchName]: text.trim() || null }), 350);
    return () => clearTimeout(timer);
    // Solo reacciona al texto escrito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const filterKeys = [searchName, ...selects.map((s) => s.name), ...(tabs ? [tabs.name] : [])];
  const hasFilters = filterKeys.some((key) => {
    const value = params.get(key);
    if (!value) return false;
    if (tabs && key === tabs.name) return value !== tabs.defaultValue;
    const select = selects.find((s) => s.name === key);
    return !select || value !== (select.allValue ?? "");
  });

  function clear() {
    setText("");
    const next = new URLSearchParams();
    for (const key of keep) {
      const value = params.get(key);
      if (value) next.set(key, value);
    }
    start(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  }

  const activeTab = tabs ? (params.get(tabs.name) ?? tabs.defaultValue) : null;

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {tabs ? (
          <div role="tablist" aria-label={tabs.label} className={segmentedGroupClass}>
            {tabs.items.map((item) => {
              const active = item.value === activeTab;
              return (
                <button
                  key={item.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => apply({ [tabs.name]: item.value === tabs.defaultValue ? null : item.value })}
                  className={segmentedItemClass(active)}
                >
                  {item.label}
                  {item.count !== undefined ? <SegmentCount value={item.count} active={active} /> : null}
                </button>
              );
            })}
          </div>
        ) : null}
        {hasFilters ? (
          <button type="button" onClick={clear} className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-fg-muted hover:bg-muted hover:text-fg">
            <X className="size-3.5" aria-hidden /> Clear filters
          </button>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:justify-end">
        {search ? (
          <label className="relative flex h-10 w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 focus-within:border-black sm:w-72">
            {pending ? <Loader2 className="size-4 shrink-0 animate-spin text-fg-muted" aria-hidden /> : <Search className="size-4 shrink-0 text-fg-muted" aria-hidden />}
            <span className="sr-only">{search.placeholder}</span>
            <input
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={search.placeholder}
              maxLength={80}
              className="h-full w-full min-w-0 bg-transparent text-sm text-fg outline-none placeholder:text-fg-muted"
            />
            {text ? (
              <button type="button" onClick={() => setText("")} aria-label="Clear search" className="grid size-6 shrink-0 place-items-center rounded-md text-fg-muted hover:bg-muted hover:text-fg">
                <X className="size-3.5" aria-hidden />
              </button>
            ) : null}
          </label>
        ) : null}
        {selects.map((select) => (
          <label key={select.name} className="relative flex h-10 w-full items-center sm:w-44">
            <span className="sr-only">{select.label}</span>
            <select
              value={params.get(select.name) ?? select.allValue ?? ""}
              onChange={(event) => apply({ [select.name]: event.target.value === (select.allValue ?? "") ? null : event.target.value })}
              className={cn("h-10 w-full cursor-pointer appearance-none truncate rounded-lg border border-border bg-surface pl-3 pr-9 text-sm text-fg outline-none focus:border-black")}
            >
              <option value={select.allValue ?? ""}>{select.allLabel}</option>
              {select.options.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 size-4 text-fg-muted" aria-hidden />
          </label>
        ))}
        {action ? <div className="flex shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
