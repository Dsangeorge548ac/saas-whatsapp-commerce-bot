/**
 * /settings/messages — Los mensajes del bot: sugeridos según tu tipo de negocio, editables. GRATIS.
 */
import { Suspense } from "react";
import type { Metadata } from "next";
import { MessagesEditor, type MessageItem } from "@/features/settings/components/MessagesEditor";
import { currentMembership, requireWorkspace } from "@/lib/data/workspace";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Bot messages" };

export default function MessagesPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-canvas" aria-busy="true" />}>
      <MessagesContent />
    </Suspense>
  );
}

async function MessagesContent() {
  const membership = currentMembership(await requireWorkspace());
  if (!membership) return null;
  const supabase = await createClient();

  const { data: settings } = await supabase.from("tenant_settings").select("business_type, messages_reviewed_at").eq("tenant_id", membership.tenant_id).single();
  const businessType = settings?.business_type ?? "other";
  const [{ data: defaults }, { data: custom }] = await Promise.all([
    supabase.from("message_template_defaults").select("key, business_type, stage, description, body, allowed_placeholders, required_placeholders, sort_order").eq("locale", "es").in("business_type", [businessType, "all"]).order("sort_order"),
    supabase.from("tenant_messages").select("key, body").eq("tenant_id", membership.tenant_id),
  ]);

  // Por cada clave, el texto sugerido de su tipo de negocio (o el general) y, si existe, el propio del comercio.
  const customByKey = new Map((custom ?? []).map((row) => [row.key, row.body]));
  const chosen = new Map<string, NonNullable<typeof defaults>[number]>();
  for (const row of defaults ?? []) {
    const current = chosen.get(row.key);
    if (!current || row.business_type === businessType) chosen.set(row.key, row);
  }
  const items: MessageItem[] = [...chosen.values()]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((row) => ({
      key: row.key,
      stage: row.stage,
      description: row.description,
      defaultBody: row.body,
      body: customByKey.get(row.key) ?? row.body,
      isCustom: customByKey.has(row.key),
      allowed: row.allowed_placeholders,
      required: row.required_placeholders,
    }));

  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-2xl text-sm text-fg-muted">
        These are the messages your bot sends. We suggest a text for your type of business: use it as it is or make it yours. Complete the parts in [brackets] with your own information.
      </p>
      <MessagesEditor items={items} businessName={membership.name} reviewed={Boolean(settings?.messages_reviewed_at)} />
    </div>
  );
}
