/**
 * Crea el comercio del dueño justo después de verificar su email.
 *
 * Por qué aquí y no en el registro: create_tenant() exige el correo ya verificado (comprobación
 * hecha dentro de la base). El nombre y el tipo de negocio viajan en la metadata del registro,
 * pero solo sirven como ENTRADA: se vuelven a validar con Zod y la función de la base los valida
 * otra vez. La metadata nunca decide permisos ni roles.
 * Quién lo usa: features/auth/actions/verification.ts y session.ts.
 */
import "server-only";
import { z } from "zod";
import type { createClient } from "@/lib/supabase/server";
import { businessNameSchema, businessTypeSchema, inviteTokenSchema } from "@/features/auth/schemas";
import { logAudit } from "@/lib/audit";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const metadataSchema = z.object({ business_name: businessNameSchema, business_type: businessTypeSchema });

/** Si el usuario no tiene comercio y su registro trae los datos, lo crea. Devuelve true si hay comercio. */
export async function ensureTenantFromSignup(supabase: SupabaseServerClient): Promise<boolean> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return false;

  const { count } = await supabase.from("tenant_members").select("tenant_id", { count: "exact", head: true });
  if ((count ?? 0) > 0) return true;

  // Operador invitado: se une al comercio con su invitación (la base valida correo, vigencia, plan y cupo).
  const invite = inviteTokenSchema.safeParse(user.user_metadata?.invite_token);
  if (invite.success) {
    const { data: joined, error: joinError } = await supabase.rpc("accept_invitation", { p_token: invite.data });
    if (joinError || !joined) return false;
    await logAudit({ actorId: user.id, action: "INVITATION_JOINED", resource: "tenant_members", tenantId: joined });
    return true;
  }

  const parsed = metadataSchema.safeParse(user.user_metadata);
  if (!parsed.success) return false;

  const { data: tenantId, error } = await supabase.rpc("create_tenant", {
    p_name: parsed.data.business_name,
    p_business_type: parsed.data.business_type,
  });
  if (error || !tenantId) return false;

  await logAudit({ actorId: user.id, action: "SIGNUP_COMPLETED", resource: "tenants", tenantId });
  return true;
}
