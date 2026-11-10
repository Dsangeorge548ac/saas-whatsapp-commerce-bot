"use client";
/** Límite de error de las pantallas de acceso (login, registro, verificación, invitación). */
import { ErrorState } from "@/components/feedback/error-state";

export default function AuthError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState error={error} reset={reset} homeHref="/login" homeLabel="Go to log in" />;
}
