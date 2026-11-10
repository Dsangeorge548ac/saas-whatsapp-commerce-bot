/**
 * Layout del área privada (mismo diseño que Tax Pro).
 *
 *   ┌──────┬───────────────────────────────────────────┐
 *   │ Riel │ ╭───────────────────────────────────────╮ │
 *   │ 80px │ │ Panel blanco redondeado (contenido,    │ │
 *   │      │ │ 100% del ancho)                        │ │
 *   │      │ ╰───────────────────────────────────────╯ │
 *   └──────┴───────────────────────────────────────────┘
 * El riel va sobre el fondo gris del marco, sin borde; el contenido es un panel blanco con esquinas
 * redondeadas, borde y sombra suave. La barra de scroll es la de la ventana; el riel queda fijo.
 * Móvil: el riel pasa a una barra inferior (BottomNav).
 *
 * Compuerta: getWorkspace() carga todo en UNA llamada. Sin sesión → /login; comercio suspendido →
 * /account-disabled. Lee cookies (sesión), por eso va dentro de <Suspense>.
 */
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { BottomNav } from "@/components/layout/bottom-nav";
import { NotificationBanner } from "@/components/feedback/notify";
import { PrimarySidebar } from "@/components/layout/primary-sidebar";
import { currentMembership, requireWorkspace } from "@/lib/data/workspace";
import { avatarUrl } from "@/lib/files/avatar";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}

const frameClasses = "flex min-h-dvh w-full bg-surface md:bg-canvas";
const containerClasses = "flex w-full min-w-0 flex-1";

async function AppShell({ children }: { children: React.ReactNode }) {
  const workspace = await requireWorkspace();
  const membership = currentMembership(workspace);
  if (membership?.status === "suspended" && !workspace.platform_role) redirect("/account-disabled");

  const canOperate = Boolean(membership?.billable);
  const isOwner = membership?.role === "owner";

  return (
    <div className={frameClasses}>
      <div className={containerClasses}>
        <PrimarySidebar
          canOperate={canOperate}
          unreadNotifications={workspace.unread_notifications}
          platformRole={workspace.platform_role}
          isOwner={isOwner}
          user={{
            firstName: workspace.user.first_name,
            lastName: workspace.user.last_name,
            email: workspace.user.email,
            avatarUrl: avatarUrl(workspace.user.id, workspace.user.avatar_path),
            health: canOperate ? "good" : "inactive",
          }}
        />
        {/* Única excepción a la regla de 8px: este panel lleva 18px fijos (igual que Tax Pro). */}
        <div className="min-w-0 flex-1 bg-surface md:my-2 md:mr-2 md:overflow-clip md:rounded-[18px] md:border md:border-border md:shadow-sm">
          <main className="px-4 pb-28 pt-4 sm:px-6 md:pb-8 lg:px-8">
            <NotificationBanner />
            {children}
          </main>
        </div>
      </div>
      <BottomNav canOperate={canOperate} isOwner={isOwner} />
    </div>
  );
}

function ShellSkeleton() {
  return (
    <div className={frameClasses} aria-busy="true" aria-label="Loading your workspace">
      <div className={containerClasses}>
        <div className="hidden h-dvh w-20 shrink-0 md:block" />
        <div className="flex-1 bg-surface md:my-2 md:mr-2 md:rounded-[18px] md:border md:border-border" />
      </div>
    </div>
  );
}
