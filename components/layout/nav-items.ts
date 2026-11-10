/**
 * Módulos del área privada (riel lateral en escritorio y barra inferior en móvil).
 *
 * Orden: Home, Orders, Chats, Catalog, Settings.
 * `needsPlan`: el módulo requiere suscripción vigente (pedidos y mensajes). Sin ella el menú lo
 * muestra bloqueado. `ownerOnly`: solo lo ve el dueño (un operador no puede cambiar Ajustes). Es solo visual: la base de datos (RLS y funciones) y cada Server Action
 * vuelven a comprobar la suscripción; un enlace directo tampoco da acceso.
 */
import { ClipboardList, House, MessageCircle, Settings, Store, type LucideIcon } from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Rutas extra que también marcan este ítem como activo. */
  matches?: string[];
  /** Clave del contador que se muestra sobre el icono. */
  badgeKey?: "notifications";
  /** Requiere suscripción vigente. */
  needsPlan?: boolean;
  /** Solo el dueño lo ve (los operadores no pueden cambiar nada ahí). */
  ownerOnly?: boolean;
};

export type NavBadges = Partial<Record<NonNullable<NavItem["badgeKey"]>, number>>;

export const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/dashboard", icon: House },
  { label: "Orders", href: "/orders", icon: ClipboardList, needsPlan: true },
  { label: "Chats", href: "/chats", icon: MessageCircle, needsPlan: true },
  { label: "Catalog", href: "/catalog", icon: Store },
  { label: "Settings", href: "/settings", icon: Settings, ownerOnly: true },
];

export function isActive(pathname: string, item: NavItem) {
  const paths = [item.href, ...(item.matches ?? [])];
  return paths.some((path) => pathname === path || (path !== "/dashboard" && pathname.startsWith(`${path}/`)));
}

/** Módulos que ve este usuario: los de solo dueño se ocultan a los operadores. */
export function visibleNavItems(isOwner: boolean): NavItem[] {
  return NAV_ITEMS.filter((item) => isOwner || !item.ownerOnly);
}
