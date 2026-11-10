"use client";
/**
 * Barra de navegación inferior para móvil (< 768px): reemplaza al riel lateral.
 * Mismos módulos que el sidebar más Alertas. Mismo estilo: icono en una píldora (lima si está
 * activo) y la etiqueta debajo. Respeta la zona segura del iPhone (safe-area-inset-bottom).
 * Los módulos que requieren suscripción se muestran con candado y llevan a Billing (solo visual:
 * la base de datos y las Server Actions vuelven a comprobarlo).
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Lock, UserRound } from "lucide-react";
import { isActive, visibleNavItems, type NavItem } from "@/components/layout/nav-items";
import { cn } from "@/lib/utils";

const ALERTS: NavItem = { label: "Alerts", href: "/notifications", icon: Bell };
const PROFILE: NavItem = { label: "Profile", href: "/profile", icon: UserRound };

export function BottomNav({ canOperate, isOwner }: { canOperate: boolean; isOwner: boolean }) {
  const pathname = usePathname();
  const items = [...visibleNavItems(isOwner), ALERTS, PROFILE];

  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="flex items-center justify-around">
        {items.map((item) => {
          const active = isActive(pathname, item);
          const locked = Boolean(item.needsPlan) && !canOperate;
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={locked && isOwner ? "/settings/billing" : item.href}
                aria-current={active ? "page" : undefined}
                aria-label={locked ? `${item.label} (requires an active subscription)` : undefined}
                className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[11px]", active ? "font-semibold text-fg" : "text-fg-muted")}
              >
                <span className={cn("relative grid h-8 w-12 place-items-center rounded-xl", active && "bg-accent text-accent-foreground")}>
                  <Icon className="size-5" aria-hidden />
                  {locked ? <Lock className="absolute -right-0.5 -top-0.5 size-3" aria-hidden /> : null}
                </span>
                <span className={cn("w-full truncate px-1 text-center text-[10px] leading-tight", active ? "font-semibold text-fg" : "text-fg-muted")}>
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
