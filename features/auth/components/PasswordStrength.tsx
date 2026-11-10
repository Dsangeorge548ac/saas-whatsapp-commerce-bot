"use client";
/**
 * Medidor de fuerza de la contraseña (4 barras).
 * Es solo una ayuda visual: la regla real (12+ caracteres) la validan Zod y Supabase.
 */
import { cn } from "@/lib/utils";

function scorePassword(password: string): number {
  let score = 0;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 1;
  return score;
}

const LABELS = ["Too short", "Weak", "Fair", "Good", "Strong"];

export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const score = scorePassword(password);

  return (
    <div className="mt-2 flex items-center gap-3" aria-live="polite">
      <div className="flex flex-1 gap-1">
        {[1, 2, 3, 4].map((bar) => (
          <span key={bar} className={cn("h-1 flex-1 rounded-full", bar <= score ? "bg-accent" : "bg-chart-muted")} />
        ))}
      </div>
      <span className="w-16 text-right text-xs text-fg-muted">{LABELS[score]}</span>
    </div>
  );
}
