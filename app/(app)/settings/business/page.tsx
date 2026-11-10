/**
 * /settings/business — Negocio, entrega y marca. Se configura GRATIS.
 */
import { Suspense } from "react";
import type { Metadata } from "next";
import { BusinessForm } from "@/features/settings/components/BusinessForm";
import { currentMembership, requireWorkspace } from "@/lib/data/workspace";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Business settings" };

export default function BusinessSettingsPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-canvas" aria-busy="true" />}>
      <BusinessContent />
    </Suspense>
  );
}

async function BusinessContent() {
  const membership = currentMembership(await requireWorkspace());
  if (!membership) return null;
  const supabase = await createClient();
  const [settings, branding] = await Promise.all([
    supabase.from("tenant_settings").select("business_type, currency, timezone, accepts_delivery, accepts_pickup, delivery_fee, require_delivery_location").eq("tenant_id", membership.tenant_id).single(),
    supabase.from("tenant_branding").select("accent_color, logo_path").eq("tenant_id", membership.tenant_id).single(),
  ]);
  if (!settings.data) return null;
  const s = settings.data;

  return (
    <BusinessForm
      tenantId={membership.tenant_id}
      hasLogo={Boolean(branding.data?.logo_path)}
      timeZones={Intl.supportedValuesOf("timeZone")}
      defaults={{
        name: membership.name,
        businessType: s.business_type,
        currency: s.currency as never,
        timezone: s.timezone,
        acceptsDelivery: s.accepts_delivery,
        acceptsPickup: s.accepts_pickup,
        deliveryFee: String(s.delivery_fee),
        requireDeliveryLocation: s.require_delivery_location,
        accentColor: branding.data?.accent_color ?? "",
      }}
    />
  );
}
