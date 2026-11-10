"use client";
/**
 * Pantalla de error amable para los límites de error de Next (error.tsx). Nunca muestra el mensaje técnico (puede
 * traer datos internos): solo un texto claro, "Try again" (vuelve a renderizar el segmento) y un enlace de salida.
 * El código de referencia (digest) permite buscar el error en los registros del servidor.
 */
import { useEffect } from "react";
import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = { error: Error & { digest?: string }; reset: () => void; homeHref?: string; homeLabel?: string };

export function ErrorState({ error, reset, homeHref = "/dashboard", homeLabel = "Go to Home" }: Props) {
  useEffect(() => {
    // Solo en la consola del navegador (útil en desarrollo); el servidor ya registra el error con su digest.
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-danger/10 text-danger-strong">
        <CircleAlert className="size-6" aria-hidden />
      </span>
      <div>
        <h1 className="text-lg font-semibold text-fg">Something went wrong</h1>
        <p className="mt-1 text-sm text-fg-muted">We couldn&apos;t finish that. Your data is safe. Try again, and if it keeps happening let us know.</p>
        {error.digest ? <p className="mt-2 font-mono text-[11px] text-fg-muted">Reference: {error.digest}</p> : null}
      </div>
      <div className="flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" asChild>
          <Link href={homeHref}>{homeLabel}</Link>
        </Button>
      </div>
    </div>
  );
}
