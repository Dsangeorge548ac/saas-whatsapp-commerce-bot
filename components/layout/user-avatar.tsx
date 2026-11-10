/**
 * Avatar con punto de estado (ref. sidebar-example.png: punto en la esquina).
 *   verde → comercio con suscripción vigente
 *   rojo  → sin suscripción vigente
 * Con foto (imageUrl, servida por /api/files/avatar/{id}) la muestra recortada en círculo; sin foto muestra las
 * iniciales sobre el color de acento. El color del punto siempre va
 * acompañado de texto accesible (sr-only).
 */
import { cn } from "@/lib/utils";

export type AccountHealth = "good" | "inactive";

const HEALTH = {
  good: { dot: "bg-success", label: "Subscription active" },
  inactive: { dot: "bg-danger", label: "Subscription inactive" },
} as const;

const SIZES = { sm: "size-8 text-[11px]", md: "size-9 text-xs", lg: "size-14 text-base" } as const;

export function healthLabel(health: AccountHealth) {
  return HEALTH[health].label;
}

export function UserAvatar({
  firstName,
  lastName,
  health,
  size = "md",
  ringClassName = "ring-black",
  imageUrl,
}: {
  firstName: string;
  lastName: string;
  health?: AccountHealth;
  size?: keyof typeof SIZES;
  ringClassName?: string;
  /** URL de la foto (ruta del servidor que autoriza); sin ella se muestran las iniciales. */
  imageUrl?: string | null;
}) {
  const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase() || "?";

  return (
    <span className={cn("relative inline-grid shrink-0 place-items-center rounded-full bg-accent font-semibold text-accent-foreground", SIZES[size])}>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- archivo privado servido por nuestra ruta (no-store), no por el optimizador
        <img src={imageUrl} alt="" className="size-full rounded-full object-cover" />
      ) : (
        initials
      )}
      {health ? (
        <>
          <span className={cn("absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2", HEALTH[health].dot, ringClassName)} aria-hidden />
          <span className="sr-only">{HEALTH[health].label}</span>
        </>
      ) : null}
    </span>
  );
}
