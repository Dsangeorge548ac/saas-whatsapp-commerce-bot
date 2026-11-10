"use client";
/** Límite de error de la tienda pública: aviso amable con "Try again" y volver a la tienda. */
import { ErrorState } from "@/components/feedback/error-state";

export default function StoreError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState error={error} reset={reset} homeHref="/" homeLabel="Back to the store" />;
}
