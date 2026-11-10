"use client";
/**
 * Sidebar del área privada en forma de riel compacto (mismo diseño que Tax Pro):
 *   - Arriba, la marca.
 *   - Módulos: Home, Orders, Chats, Catalog y Settings (píldora con icono y etiqueta debajo).
 *     Los que requieren suscripción se muestran con candado si el comercio no la tiene vigente
 *     (solo visual: la base de datos y las Server Actions vuelven a comprobarlo).
 *   - Abajo, notificaciones y el avatar con el menú de cuenta.
 * Solo desde md (≥ 768px); en móvil lo acompaña <BottomNav>.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CreditCard, Lock, LogOut, UserRound, Users } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Logo } from "@/components/brand/logo";
import { isActive, visibleNavItems, type NavItem } from "@/components/layout/nav-items";
import { UserAvatar, healthLabel, type AccountHealth } from "@/components/layout/user-avatar";
import { signOut } from "@/features/auth/actions/session";
import { confirmAction } from "@/components/feedback/sweet-confirm";
import { cn } from "@/lib/utils";

type SidebarProps = {
  /** true si el comercio tiene suscripción vigente (desbloquea Orders y Chats). */
  canOperate: boolean;
  unreadNotifications: number;
  user: { firstName: string; lastName: string; email: string; health: AccountHealth; avatarUrl: string | null };
  /** Dueño del comercio: solo él ve Ajustes y Billing (un operador no puede cambiarlos). */
  isOwner: boolean;
  /** Rol de plataforma (muestra el acceso a /admin/users solo al staff). */
  platformRole: "developer" | "platform_admin" | null;
};

/** Separación entre el riel y el menú de cuenta. */
const ACCOUNT_MENU_GAP = 30;

export function PrimarySidebar({ canOperate, unreadNotifications, user, platformRole, isOwner }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-dvh w-20 shrink-0 flex-col items-center justify-between overflow-hidden bg-canvas pb-2 pt-2 md:flex">
      <div className="flex w-full flex-col items-center gap-6">
        <Link href="/dashboard" aria-label="Home" className="grid size-11 place-items-center rounded-xl focus-visible:ring-2 focus-visible:ring-black">
          <Logo withName={false} />
        </Link>
        <nav aria-label="Main" className="flex w-full flex-col items-center gap-2.5">
          {visibleNavItems(isOwner).map((item) => (
            <RailLink key={item.href} item={item} active={isActive(pathname, item)} locked={Boolean(item.needsPlan) && !canOperate} isOwner={isOwner} />
          ))}
        </nav>
      </div>

      <div className="flex flex-col items-center gap-3">
        <Link
          href="/notifications"
          aria-label="Notifications"
          title="Notifications"
          aria-current={pathname.startsWith("/notifications") ? "page" : undefined}
          className={cn(
            "grid size-10 place-items-center rounded-xl text-fg transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-black",
            pathname.startsWith("/notifications") && "bg-accent text-accent-foreground hover:bg-accent",
          )}
        >
          <span className="relative">
            <Bell className="size-5" aria-hidden />
            {unreadNotifications > 0 ? (
              <span className="absolute -right-2 -top-2 grid min-w-4 place-items-center rounded-full bg-black px-1 text-[10px] font-semibold leading-4 text-white">
                {unreadNotifications > 99 ? "99+" : unreadNotifications}
                <span className="sr-only"> unread</span>
              </span>
            ) : null}
          </span>
        </Link>
        <AccountMenu user={user} platformRole={platformRole} isOwner={isOwner} />
      </div>
    </aside>
  );
}

/** Botón del riel con píldora y etiqueta truncada. Bloqueado = sin enlace y con candado. */
function RailLink({ item, active, locked, isOwner }: { item: NavItem; active: boolean; locked: boolean; isOwner: boolean }) {
  const Icon = item.icon;
  const content = (
    <>
      <span
        className={cn(
          "relative grid h-9 w-12 shrink-0 place-items-center rounded-xl transition-colors",
          active ? "bg-accent text-accent-foreground" : "text-fg group-hover:bg-muted",
          locked && "text-fg-muted",
        )}
      >
        <Icon className="size-5" aria-hidden />
        {locked ? <Lock className="absolute -right-0.5 -top-0.5 size-3" aria-hidden /> : null}
      </span>
      <span
        title={item.label}
        className={cn("w-full truncate px-1 text-center text-[10px] leading-tight", active ? "font-semibold text-fg" : "text-fg-muted group-hover:text-fg")}
      >
        {item.label}
      </span>
    </>
  );

  // Bloqueado: al dueño lo lleva a Settings > Billing; al operador, al módulo (que le explica que pida el plan al dueño).
  return (
    <Link
      href={locked && isOwner ? "/settings/billing" : item.href}
      aria-current={active ? "page" : undefined}
      aria-label={locked ? `${item.label} (requires an active subscription)` : undefined}
      title={locked ? `${item.label} · requires a subscription` : item.label}
      className="group flex w-16 flex-col items-center gap-1 rounded-xl py-1 focus-visible:ring-2 focus-visible:ring-black"
    >
      {content}
    </Link>
  );
}

function AccountMenu({ user, platformRole, isOwner }: { user: SidebarProps["user"]; platformRole: SidebarProps["platformRole"]; isOwner: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-rail-account
          aria-label={`Account menu. ${healthLabel(user.health)}`}
          className="rounded-full focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
        >
          <UserAvatar firstName={user.firstName} lastName={user.lastName} health={user.health} ringClassName="ring-canvas" imageUrl={user.avatarUrl} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" sideOffset={ACCOUNT_MENU_GAP} className="w-64 rounded-lg border border-border bg-surface p-1 shadow-lg">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-semibold text-fg">
            {user.firstName} {user.lastName}
          </p>
          <p className="truncate text-xs text-fg-muted">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile">
            <UserRound aria-hidden /> Profile
          </Link>
        </DropdownMenuItem>
        {isOwner ? (
          <DropdownMenuItem asChild>
            <Link href="/settings/billing">
              <CreditCard aria-hidden /> Billing
            </Link>
          </DropdownMenuItem>
        ) : null}
        {platformRole ? (
          <DropdownMenuItem asChild>
            <Link href="/admin/users">
              <Users aria-hidden /> Users
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        {/* Cerrar sesión también se confirma (regla del proyecto). */}
        <DropdownMenuItem
          variant="destructive"
          onSelect={async () => {
            const answer = await confirmAction({ title: "Sign out?", text: "You'll need your email and password to log in again.", confirmLabel: "Sign out" });
            if (answer.confirmed) await signOut();
          }}
        >
          <LogOut aria-hidden /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
