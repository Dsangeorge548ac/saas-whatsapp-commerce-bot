/**
 * Insignias de estado (Verified, In review, Rejected, Not started, Active…).
 * Color + texto siempre juntos. Texto oscuro sobre fondo suave para que se lea bien.
 */
import { cn } from "@/lib/utils";

export type BadgeTone = "success" | "warning" | "danger" | "neutral" | "accent";

const TONES: Record<BadgeTone, string> = {
  success: "bg-success/15 text-fg [&>span]:bg-success",
  warning: "bg-warning/20 text-fg [&>span]:bg-warning",
  danger: "bg-danger/15 text-fg [&>span]:bg-danger",
  neutral: "bg-muted text-fg-muted [&>span]:bg-chart-muted-strong",
  accent: "bg-accent text-accent-foreground [&>span]:bg-accent-foreground",
};

export function StatusBadge({ tone, children, className }: { tone: BadgeTone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase", TONES[tone], className)}>
      <span className="size-1.5 rounded-full" aria-hidden />
      {children}
    </span>
  );
}
