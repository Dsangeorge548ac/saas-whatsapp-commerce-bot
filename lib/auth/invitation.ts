/**
 * Vista previa de una invitación (correo invitado y comercio) a partir del token del enlace.
 * Lo usan /register?invite=…, /join y el registro (signUp): el correo de la cuenta del invitado SIEMPRE es el de
 * la invitación, nunca uno escrito a mano (así el código de verificación le llega a quien fue invitado).
 * La base valida que la invitación siga abierta; un token inválido, usado, revocado o vencido devuelve null.
 */
import "server-only";
import { z } from "zod";
import { createAnonClient } from "@/lib/supabase/anon";
import { inviteTokenSchema } from "@/features/auth/schemas";

const previewSchema = z.object({ email: z.string(), business_name: z.string() });
export type InvitationPreview = { email: string; businessName: string };

export async function getInvitationPreview(token: unknown): Promise<InvitationPreview | null> {
  const parsed = inviteTokenSchema.safeParse(token);
  if (!parsed.success) return null;
  const { data, error } = await createAnonClient().rpc("get_invitation_preview", { p_token: parsed.data });
  const preview = previewSchema.safeParse(data);
  return error || !preview.success ? null : { email: preview.data.email, businessName: preview.data.business_name };
}
