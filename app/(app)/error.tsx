"use client";
/** Límite de error del área privada: si una pantalla o acción falla, se muestra un aviso con "Try again". */
import { ErrorState } from "@/components/feedback/error-state";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState error={error} reset={reset} />;
}
