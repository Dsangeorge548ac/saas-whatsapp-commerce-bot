"use client";
/**
 * Cierra en silencio la sesión de una cuenta inhabilitada al abrir /account-disabled.
 * (Un Server Component no puede borrar cookies; por eso se hace con una Server Action.)
 */
import { useEffect } from "react";
import { endDisabledSession } from "@/features/auth/actions/session";

export function EndDisabledSession() {
  useEffect(() => {
    void endDisabledSession();
  }, []);
  return null;
}
