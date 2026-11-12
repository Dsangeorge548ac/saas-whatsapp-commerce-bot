/**
 * /settings/whatsapp — Conexión del número de WhatsApp del comercio. Se configura GRATIS.
 * Recomendado: "Connect with Facebook" (WhatsApp Embedded Signup); avanzado: pegar los IDs y un token a mano.
 * El token nunca se lee de vuelta: solo se ve el estado de la conexión (columnas sin la referencia al secreto).
 */
import { Suspense } from "react";
import type { Metadata } from "next";
import { Alert } from "@/components/feedback/alert";
import { StatusBadge } from "@/components/layout/status-badge";
import { DisconnectWhatsAppButton } from "@/features/settings/components/DisconnectWhatsAppButton";
import { EmbeddedSignupButton } from "@/features/settings/components/EmbeddedSignupButton";
import { WhatsAppForm } from "@/features/settings/components/WhatsAppForm";
import { publicEnv } from "@/lib/env";
import { currentMembership, requireWorkspace } from "@/lib/data/workspace";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "WhatsApp" };

export default function WhatsAppPage() {
  return (
    <Suspense fallback={<div className="h-72 animate-pulse rounded-lg bg-canvas" aria-busy="true" />}>
      <WhatsAppContent />
    </Suspense>
  );
}

const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

async function WhatsAppContent() {
  const membership = currentMembership(await requireWorkspace());
  if (!membership) return null;
  const supabase = await createClient();
  const { data: account } = await supabase
    .from("tenant_whatsapp_accounts")
    .select("display_phone, status, last_error, connected_at, last_checked_at")
    .eq("tenant_id", membership.tenant_id)
    .maybeSingle();

  const connected = account?.status === "connected";
  const appId = publicEnv.NEXT_PUBLIC_META_APP_ID;
  const configId = publicEnv.NEXT_PUBLIC_META_ES_CONFIG_ID;
  return (
    <div className="flex flex-col gap-6">
      {account ? (
        <section aria-labelledby="wa-status" className="flex max-w-2xl flex-col gap-1 rounded-lg border border-border bg-surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 id="wa-status" className="flex flex-wrap items-center gap-2 text-base font-semibold text-fg">
              Your WhatsApp number
              <StatusBadge tone={connected ? "success" : account.status === "error" ? "danger" : "neutral"}>{connected ? "Connected" : account.status === "error" ? "Needs attention" : "Pending"}</StatusBadge>
            </h2>
            <DisconnectWhatsAppButton phone={account.display_phone} />
          </div>
          <p className="text-sm text-fg">{account.display_phone ?? "Number connected"}</p>
          {account.connected_at ? <p className="text-xs text-fg-muted">Connected {date.format(new Date(account.connected_at))}</p> : null}
          {account.last_error ? <p className="text-xs text-danger-strong">Last problem: {account.last_error}. Reconnect with Facebook.</p> : null}
        </section>
      ) : (
        <Alert tone="accent" title="Connect your business number">
          Without it the bot can&apos;t receive or send messages. Log in with Facebook and choose your number: we set up the rest for you.
        </Alert>
      )}

      {/* Recomendado: WhatsApp Embedded Signup (sin copiar IDs ni tokens). */}
      <section aria-labelledby="wa-connect" className="flex max-w-2xl flex-col gap-3 rounded-lg border border-border bg-surface p-5">
        <h2 id="wa-connect" className="text-base font-semibold text-fg">{account ? "Change or reconnect your number" : "Connect in a few clicks"}</h2>
        <ol className="flex flex-col gap-1.5 text-sm text-fg-muted">
          <li>1. Log in with the Facebook account that manages your business.</li>
          <li>2. Choose (or create) your business and your WhatsApp Business account.</li>
          <li>3. Add or pick your phone number and verify it with the code Meta sends.</li>
        </ol>
        {appId && configId ? (
          <EmbeddedSignupButton appId={appId} configId={configId} connected={Boolean(account)} />
        ) : (
          <p className="rounded-lg bg-canvas p-3 text-xs text-fg-muted">Connecting with Facebook isn&apos;t enabled on this platform yet. Use the manual connection below.</p>
        )}
      </section>

      {/* Avanzado: pegar los IDs y un token permanente (para quien ya los tiene). */}
      <details className="group max-w-2xl rounded-lg border border-border bg-surface">
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-medium text-fg marker:hidden">
          <span className="flex items-center justify-between gap-2">Connect manually (advanced) <span className="text-fg-muted transition-transform group-open:rotate-180" aria-hidden>▾</span></span>
          <span className="mt-0.5 block text-xs font-normal text-fg-muted">Paste your WhatsApp Business Account ID, Phone number ID and a permanent token.</span>
        </summary>
        <div className="border-t border-border p-5">
          <WhatsAppForm connected={Boolean(account)} />
        </div>
      </details>
      <p className="max-w-xl text-xs text-fg-muted">
        Customers write to this number and your bot answers. Each business uses its own number. Messages are billed by Meta to your WhatsApp Business account, not by us.
      </p>
    </div>
  );
}
