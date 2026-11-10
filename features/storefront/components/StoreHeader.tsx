/**
 * Cabecera de la tienda pública con el nombre y el color de la marca del comercio.
 * El color lo elige el dueño; se valida (#RRGGBB) y el texto se ajusta para que siempre contraste.
 */
import Link from "next/link";
import { readableTextColor, safeBrandColor } from "@/lib/storefront/color";

export function StoreHeader({ name, accent, backHref }: { name: string; accent?: string | null; backHref?: string }) {
  const background = safeBrandColor(accent);
  const color = readableTextColor(background);
  return (
    <header style={{ backgroundColor: background, color }}>
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
        <Link href="/" className="truncate text-base font-semibold tracking-tight">
          {name}
        </Link>
        {backHref ? (
          <Link href={backHref} className="shrink-0 text-xs font-medium underline-offset-2 hover:underline">
            All catalogs
          </Link>
        ) : null}
      </div>
    </header>
  );
}
