/**
 * /settings/go-live — Encender o pausar el bot. Lo necesario sale de get_onboarding_status() (datos reales).
 */
import { Suspense } from "react";
import type { Metadata } from "next";
import { z } from "zod";
import { GoLivePanel, type Requirement } from "@/features/settings/components/GoLivePanel";
import { currentMembership, requireWorkspace } from "@/lib/data/workspace";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Go live" };

export default function GoLivePage() {
  return (
    <Suspense fallback={<div className="h-72 animate-pulse rounded-lg bg-canvas" aria-busy="true" />}>
      <GoLiveContent />
    </Suspense>
  );
}

const statusSchema = z.object({ steps: z.array(z.object({ key: z.string(), done: z.boolean() })), bot_enabled: z.boolean() });

const REQUIREMENTS: { key: string; label: string; href: string }[] = [
  { key: "whatsapp", label: "WhatsApp number connected", href: "/settings/whatsapp" },
  { key: "payment_methods", label: "At least one payment method", href: "/settings/payments" },
  { key: "catalog", label: "At least one available product", href: "/catalog" },
  { key: "subscription", label: "An active plan", href: "/settings/billing" },
];

async function GoLiveContent() {
  const membership = currentMembership(await requireWorkspace());
  if (!membership) return null;
  const supabase = await createClient();
  const [{ data }, { data: settings }] = await Promise.all([
    supabase.rpc("get_onboarding_status", { p_tenant: membership.tenant_id }),
    supabase.from("tenant_settings").select("bot_tested_at").eq("tenant_id", membership.tenant_id).single(),
  ]);
  const status = statusSchema.safeParse(data);
  if (!status.success) return null;

  const done = new Map(status.data.steps.map((step) => [step.key, step.done]));
  const requirements: Requirement[] = REQUIREMENTS.map((item) => ({ ...item, done: done.get(item.key) === true }));
  return <GoLivePanel botEnabled={status.data.bot_enabled} requirements={requirements} tested={Boolean(settings?.bot_tested_at)} />;
}
