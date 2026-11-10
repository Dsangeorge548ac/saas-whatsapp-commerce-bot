/**
 * Carga del contexto de un comercio y de sus credenciales de WhatsApp (solo servidor).
 *
 * Seguridad: el token de Meta sale de Supabase Vault con get_whatsapp_credentials() (solo service
 * role) y solo vive en memoria durante la petición; nunca se registra ni se devuelve al navegador.
 * Quién lo usa: features/whatsapp/process-event.ts y order-notifications.ts.
 */
import "server-only";
import { getServerEnv } from "@/lib/env.server";
import type { Admin, Credentials, Ctx, Tenant } from "@/features/whatsapp/types";

export async function loadTenant(admin: Admin, tenantId: string): Promise<Tenant | null> {
  const [tenant, settings, branding, billable] = await Promise.all([
    admin.from("tenants").select("id, slug, status").eq("id", tenantId).maybeSingle(),
    admin.from("tenant_settings").select("business_type, currency, timezone, bot_enabled, accepts_delivery, accepts_pickup, require_delivery_location").eq("tenant_id", tenantId).maybeSingle(),
    admin.from("tenant_branding").select("display_name").eq("tenant_id", tenantId).maybeSingle(),
    admin.rpc("tenant_is_billable", { p_tenant: tenantId }),
  ]);
  if (!tenant.data || !settings.data) return null;
  return {
    id: tenant.data.id,
    slug: tenant.data.slug,
    status: tenant.data.status,
    businessName: branding.data?.display_name ?? "",
    businessType: settings.data.business_type,
    currency: settings.data.currency,
    timezone: settings.data.timezone,
    botEnabled: settings.data.bot_enabled,
    billable: billable.data === true,
    acceptsDelivery: settings.data.accepts_delivery,
    acceptsPickup: settings.data.accepts_pickup,
    requireDeliveryLocation: settings.data.require_delivery_location,
  };
}

/** Credenciales del comercio. Sin token solo se permite el modo simulado de desarrollo. */
export async function loadCredentials(admin: Admin, tenantId: string): Promise<Credentials> {
  const { data } = await admin.rpc("get_whatsapp_credentials", { p_tenant: tenantId });
  const row = data?.[0];
  const dryRun = getServerEnv().WHATSAPP_DRY_RUN === "1" && process.env.NODE_ENV !== "production";
  if (!row || (!row.access_token && !dryRun)) throw new Error("NO_CREDENTIALS");
  return { phoneNumberId: row.phone_number_id, token: row.access_token };
}

/** Contexto de una conversación existente (para avisar al cliente desde fuera del webhook, p. ej. al enviar el pedido web). */
export async function loadSessionContext(admin: Admin, tenantId: string, sessionId: string): Promise<Ctx | null> {
  const { data: session } = await admin.from("conversation_sessions").select("*").eq("id", sessionId).eq("tenant_id", tenantId).maybeSingle();
  if (!session) return null;
  const [tenant, customer] = await Promise.all([
    loadTenant(admin, tenantId),
    admin.from("customers").select("id, phone_e164, profile_name").eq("id", session.customer_id).eq("tenant_id", tenantId).maybeSingle(),
  ]);
  if (!tenant || !customer.data) return null;
  const creds = await loadCredentials(admin, tenantId);
  return { admin, tenant, creds, customer: { id: customer.data.id, phone: customer.data.phone_e164, name: customer.data.profile_name }, session, wamid: null };
}
