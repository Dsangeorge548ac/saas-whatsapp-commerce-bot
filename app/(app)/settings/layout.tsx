/**
 * Layout de Ajustes: título, pestañas y compuerta de rol.
 *
 * Solo el DUEÑO configura el comercio (negocio, horario, pagos, mensajes, WhatsApp, equipo y plan). Un
 * operador ve un aviso. Esto es solo la parte visual: las Server Actions y la base de datos (RLS y
 * funciones) vuelven a exigir que sea el dueño. Lee la sesión, por eso va dentro de <Suspense>.
 */
import { Suspense } from "react";
import { Alert } from "@/components/feedback/alert";
import { SettingsTabs } from "@/features/settings/components/SettingsTabs";
import { currentMembership, requireWorkspace } from "@/lib/data/workspace";
import { createClient } from "@/lib/supabase/server";

/** Paso obligatorio de la guía → pestaña donde se resuelve. */
const STEP_TAB: Record<string, string> = {
  whatsapp: "/settings/whatsapp",
  payment_methods: "/settings/payments",
  bot_messages: "/settings/messages",
  subscription: "/settings/billing",
  go_live: "/settings/go-live",
};

export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return (
    <Suspense fallback={<div className="h-72 animate-pulse rounded-lg bg-canvas" aria-busy="true" />}>
      <SettingsShell>{children}</SettingsShell>
    </Suspense>
  );
}

async function SettingsShell({ children }: { children: React.ReactNode }) {
  const membership = currentMembership(await requireWorkspace());
  if (!membership) {
    return <Alert tone="warning" title="We couldn't find your business">Sign out and log in again to finish creating it.</Alert>;
  }
  if (membership.role !== "owner") {
    return (
      <div className="mx-auto max-w-md py-16">
        <Alert tone="info" title="Only the owner can change settings">Ask the owner of {membership.name} if something needs to change.</Alert>
      </div>
    );
  }

  // Pasos pendientes de la guía → punto "needs attention" en su pestaña (solo los obligatorios).
  const supabase = await createClient();
  const { data: onboarding } = await supabase.rpc("get_onboarding_status", { p_tenant: membership.tenant_id });
  const steps = Array.isArray((onboarding as { steps?: unknown } | null)?.steps) ? ((onboarding as { steps: { key: string; done: boolean }[] }).steps) : [];
  const attention = steps.filter((step) => !step.done && STEP_TAB[step.key]).map((step) => STEP_TAB[step.key]!);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-medium tracking-tight text-fg">Settings</h1>
        <p className="mt-1 text-sm text-fg-muted">Everything here is free to set up. You only need a plan to turn the bot on and invite your team.</p>
      </header>
      <SettingsTabs attention={[...new Set(attention)]} />
      {children}
    </div>
  );
}
