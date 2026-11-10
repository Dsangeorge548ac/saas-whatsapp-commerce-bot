-- 0022: vista previa de una invitación por su token (para el registro del invitado).
-- Devuelve el correo INVITADO y el nombre del comercio solo si la invitación sigue abierta (no aceptada, no
-- revocada, no vencida). El registro usa ESE correo (no uno escrito a mano), así el código de verificación
-- siempre le llega a la persona invitada. Quien tiene el enlace ya es el destinatario: el token es un secreto
-- de 64 caracteres hex (no se puede adivinar) y la base solo guarda su hash.
create function public.get_invitation_preview(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('email', i.email::text, 'business_name', t.name)
    from public.tenant_invitations i
    join public.tenants t on t.id = i.tenant_id
   where p_token ~ '^[0-9a-f]{64}$'
     and i.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
     and i.accepted_at is null and i.revoked_at is null and i.expires_at > now();
$$;
revoke execute on function public.get_invitation_preview(text) from public;
grant execute on function public.get_invitation_preview(text) to anon, authenticated;
