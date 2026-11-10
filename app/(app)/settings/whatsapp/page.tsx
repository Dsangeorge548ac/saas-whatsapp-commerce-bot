/**
 * /settings/whatsapp — Conexión del número de WhatsApp del comercio. Se configura GRATIS.
 * El token nunca se lee de vuelta: solo se ve el estado de la conexión (columnas sin la referencia al secreto).
 */
import { Suspense } from "react";
import type { Metadata } from "next";
import { Alert } from "@/components/feedback/alert";
import { StatusBadge } from "@/components/layout/status-badge";
import { WhatsAppForm } from "@/features/settings/components/WhatsAppForm";
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
  return (
    <div className="flex flex-col gap-6">
      {account ? (
        <section aria-labelledby="wa-status" className="flex max-w-xl flex-col gap-1 rounded-lg border border-border bg-surface p-5">
          <h2 id="wa-status" className="flex flex-wrap items-center gap-2 text-base font-semibold text-fg">
            Your WhatsApp number
            <StatusBadge tone={connected ? "success" : account.status === "error" ? "danger" : "neutral"}>{connected ? "Connected" : account.status === "error" ? "Needs attention" : "Pending"}</StatusBadge>
          </h2>
          <p className="text-sm text-fg">{account.display_phone ?? "Number connected"}</p>
          {account.connected_at ? <p className="text-xs text-fg-muted">Connected {date.format(new Date(account.connected_at))}</p> : null}
          {account.last_error ? <p className="text-xs text-danger-strong">Last problem: {account.last_error}. Reconnect with a new token.</p> : null}
        </section>
      ) : (
        <Alert tone="accent" title="Connect your business number">Without it the bot can&apos;t receive or send messages. You&apos;ll need the IDs and a token from your Meta WhatsApp Business account.</Alert>
      )}
      <WhatsAppForm connected={Boolean(account)} />
      <p className="max-w-xl text-xs text-fg-muted">
        Customers write to this number and your bot answers. Each business uses its own number. Messages are billed by Meta to your WhatsApp Business account, not by us.
      </p>
    </div>
  );
}
