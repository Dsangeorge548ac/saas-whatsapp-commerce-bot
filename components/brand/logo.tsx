/**
 * Logotipo: mismo diseño que Tax Pro (marca negra con su ícono) + el nombre de la marca.
 * `withName={false}` muestra solo la marca (riel lateral, móvil).
 * El nombre sale de NEXT_PUBLIC_APP_NAME (Astra).
 */
import { cn } from "@/lib/utils";
import { publicEnv } from "@/lib/env";

export function Logo({ withName = true, className }: { withName?: boolean; className?: string }) {
  const name = publicEnv.NEXT_PUBLIC_APP_NAME;
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span aria-hidden className="relative grid size-8 place-items-center rounded-lg">
        {/* Misma imagen que usa Tax Pro. Pendiente: alojarla en /public para no depender de un tercero. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="https://keenthemes.com/metronic/starter-kits/vite/media/app/mini-logo-white.svg" className="invert-100" alt="" />
      </span>
      {withName ? <span className="text-sm font-semibold tracking-tight text-fg">{name}</span> : <span className="sr-only">{name}</span>}
    </span>
  );
}
