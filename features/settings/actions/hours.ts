"use server";
/**
 * Server Action del horario de atención. Solo el dueño. Guarda los 7 días de una vez con la función de la
 * base set_business_hours() (atómica; rechaza semanas incompletas, días repetidos, apertura = cierre y activar
 * un horario sin ningún día abierto). Fuera de horario el bot responde con la apertura y el cierre.
 */
import { revalidatePath } from "next/cache";
import { getOwnerContext } from "@/lib/auth/owner";
import { NOT_FOUND, hoursSchema, type ActionResult } from "@/features/settings/schemas";

export async function saveHours(input: unknown): Promise<ActionResult> {
  const owner = await getOwnerContext();
  if (!owner) return NOT_FOUND;
  const parsed = hoursSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the hours and try again." };

  const days = parsed.data.days.map((d) => ({
    weekday: d.weekday,
    is_open: d.isOpen,
    opens_at: d.isOpen ? d.opensAt : null,
    closes_at: d.isOpen ? d.closesAt : null,
  }));
  const { error } = await owner.supabase.rpc("set_business_hours", { p_tenant: owner.tenantId, p_enabled: parsed.data.enabled, p_days: days });
  if (error) return { ok: false, error: error.message.includes("HOURS_INVALID") ? "Open at least one day, or choose “always open”." : "We couldn't save your hours." };
  revalidatePath("/settings/hours");
  return { ok: true, message: parsed.data.enabled ? "Business hours saved" : "Your business is set to always open" };
}
