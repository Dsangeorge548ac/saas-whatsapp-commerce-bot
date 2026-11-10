"use client";
/**
 * Cuenta regresiva para el botón "Resend code" (evita pedir códigos sin parar).
 * Es una ayuda de UX: los límites reales los aplica Supabase en el servidor.
 */
import { useEffect, useState } from "react";

export function useCooldown(seconds: number) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setTimeout(() => setRemaining((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);

  return {
    remaining,
    isCoolingDown: remaining > 0,
    start: () => setRemaining(seconds),
  };
}
