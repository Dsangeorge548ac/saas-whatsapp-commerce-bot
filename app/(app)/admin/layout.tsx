/**
 * Layout de /admin: solo para el staff de plataforma (developer y platform_admin). Cualquier otra persona recibe
 * 404 (no se revela que existe). Es solo la parte visual: las consultas y acciones vuelven a exigir el rol, y la
 * base de datos también. Lee la sesión, por eso va dentro de <Suspense>.
 */
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AdminTabs } from "@/features/admin/components/AdminTabs";
import { requireWorkspace } from "@/lib/data/workspace";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={<div className="h-72 animate-pulse rounded-lg bg-canvas" aria-busy="true" />}>
      <AdminGate>{children}</AdminGate>
    </Suspense>
  );
}

async function AdminGate({ children }: { children: React.ReactNode }) {
  const workspace = await requireWorkspace();
  if (!workspace.platform_role) notFound();
  return (
    <div className="flex flex-col gap-6">
      <AdminTabs />
      {children}
    </div>
  );
}
