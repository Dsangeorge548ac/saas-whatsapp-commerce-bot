/**
 * /settings/hours — Días y horas de atención del comercio. Se configura GRATIS.
 */
import { Suspense } from "react";
import type { Metadata } from "next";
import { HoursEditor, type DayState } from "@/features/settings/components/HoursEditor";
import { currentMembership, requireWorkspace } from "@/lib/data/workspace";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Business hours" };

export default function HoursPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-canvas" aria-busy="true" />}>
      <HoursContent />
    </Suspense>
  );
}

const hhmm = (time: string | null, fallback: string) => (time ? time.slice(0, 5) : fallback);

async function HoursContent() {
  const membership = currentMembership(await requireWorkspace());
  if (!membership) return null;
  const supabase = await createClient();
  const [settings, rows] = await Promise.all([
    supabase.from("tenant_settings").select("hours_enabled, timezone").eq("tenant_id", membership.tenant_id).single(),
    supabase.from("tenant_business_hours").select("weekday, is_open, opens_at, closes_at").eq("tenant_id", membership.tenant_id),
  ]);

  // Sin horario guardado: propuesta de lunes a viernes de 9 a 18 (no se guarda hasta que el dueño pulse "Save").
  const byDay = new Map((rows.data ?? []).map((row) => [row.weekday, row]));
  const days: DayState[] = [1, 2, 3, 4, 5, 6, 7].map((weekday) => {
    const row = byDay.get(weekday);
    return row
      ? { weekday, isOpen: row.is_open, opensAt: hhmm(row.opens_at, "09:00"), closesAt: hhmm(row.closes_at, "18:00") }
      : { weekday, isOpen: weekday <= 5, opensAt: "09:00", closesAt: "18:00" };
  });

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-2xl text-sm text-fg-muted">
        Times use your time zone ({settings.data?.timezone ?? "UTC"}). You can change it in Business. Outside these hours, customers get a message with when you open and close, and no orders are taken.
      </p>
      <HoursEditor initialEnabled={settings.data?.hours_enabled ?? false} initialDays={days} />
    </div>
  );
}
