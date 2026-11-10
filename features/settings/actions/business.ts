"use server";
/**
 * Server Action de "Business": nombre, tipo, moneda, zona horaria, entrega, ubicación GPS y marca.
 * Solo el dueño. Se valida con Zod y se escribe con la sesión del usuario (RLS vuelve a exigir "dueño";
 * las columnas protegidas —bot activo, horario— no tienen permiso de escritura y solo cambian por RPC).
 */
import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import { getOwnerContext } from "@/lib/auth/owner";
import { NOT_FOUND, businessSchema, type ActionResult } from "@/features/settings/schemas";

export async function updateBusiness(input: unknown): Promise<ActionResult> {
  const owner = await getOwnerContext();
  if (!owner) return NOT_FOUND;
  const parsed = businessSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields and try again." };
  const data = parsed.data;
  // El logo tiene que estar en la carpeta de ESTE comercio (nadie puede apuntar a archivos de otro).
  if (data.logoPath && !data.logoPath.startsWith(`${owner.tenantId}/logo/`)) return NOT_FOUND;

  const { error: tenantError } = await owner.supabase.from("tenants").update({ name: data.name }).eq("id", owner.tenantId);
  const { error: brandingError } = await owner.supabase
    .from("tenant_branding")
    .update({ display_name: data.name, accent_color: data.accentColor, ...(data.logoPath ? { logo_path: data.logoPath } : {}) })
    .eq("tenant_id", owner.tenantId);
  const { error: settingsError } = await owner.supabase
    .from("tenant_settings")
    .update({
      business_type: data.businessType,
      currency: data.currency,
      timezone: data.timezone,
      accepts_delivery: data.acceptsDelivery,
      accepts_pickup: data.acceptsPickup,
      delivery_fee: data.deliveryFee,
      require_delivery_location: data.requireDeliveryLocation,
    })
    .eq("tenant_id", owner.tenantId);
  if (tenantError || brandingError || settingsError) return { ok: false, error: "We couldn't save your changes. Please try again." };

  await logAudit({ actorId: owner.userId, action: "BUSINESS_UPDATED", resource: "tenant_settings", tenantId: owner.tenantId });
  revalidatePath("/settings", "layout");
  return { ok: true, message: "Business settings saved" };
}
