-- 0015_whatsapp_credentials_session: credenciales de WhatsApp en Supabase Vault y sesión de conversación.
--
-- Todas estas funciones son SOLO para la service role (el servidor de Next.js): el token de acceso de
-- Meta nunca se lee desde el navegador ni desde ninguna política RLS. Se guarda cifrado en Vault y la
-- tabla tenant_whatsapp_accounts solo guarda el id del secreto.

-- Guarda (o rota) el token y registra el número del comercio. Queda en `pending` hasta que el servidor
-- verifique la conexión con Meta y llame a set_whatsapp_status().
create function public.set_whatsapp_account(
  p_tenant uuid, p_waba text, p_phone_number_id text, p_display_phone text, p_token text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_acc public.tenant_whatsapp_accounts;
  v_secret uuid;
  v_id uuid;
begin
  if btrim(coalesce(p_token, '')) = '' then raise exception 'TOKEN_REQUIRED'; end if;
  select * into v_acc from public.tenant_whatsapp_accounts where tenant_id = p_tenant;
  if found and v_acc.access_token_secret_id is not null then
    perform vault.update_secret(v_acc.access_token_secret_id, p_token);
    v_secret := v_acc.access_token_secret_id;
  else
    v_secret := vault.create_secret(p_token, 'wa_token_' || p_tenant::text, 'WhatsApp access token');
  end if;

  insert into public.tenant_whatsapp_accounts (tenant_id, waba_id, phone_number_id, display_phone, access_token_secret_id, status)
  values (p_tenant, p_waba, p_phone_number_id, nullif(p_display_phone, ''), v_secret, 'pending')
  on conflict (tenant_id) do update
    set waba_id = excluded.waba_id, phone_number_id = excluded.phone_number_id,
        display_phone = excluded.display_phone, access_token_secret_id = excluded.access_token_secret_id,
        status = 'pending', last_error = null
  returning id into v_id;
  return v_id;
end;
$$;

create function public.set_whatsapp_status(p_tenant uuid, p_status public.whatsapp_status, p_error text default null)
returns void language sql security definer set search_path = '' as $$
  update public.tenant_whatsapp_accounts
     set status = p_status, last_error = left(p_error, 500), last_checked_at = now(),
         connected_at = case when p_status = 'connected' then coalesce(connected_at, now()) else connected_at end
   where tenant_id = p_tenant;
$$;

-- Token descifrado para enviar mensajes o descargar medios. Nunca se registra ni se devuelve al navegador.
create function public.get_whatsapp_credentials(p_tenant uuid)
returns table (phone_number_id text, access_token text, status public.whatsapp_status)
language sql stable security definer set search_path = '' as $$
  select a.phone_number_id, d.decrypted_secret, a.status
    from public.tenant_whatsapp_accounts a
    left join vault.decrypted_secrets d on d.id = a.access_token_secret_id
   where a.tenant_id = p_tenant;
$$;

-- Sesión abierta del cliente (la crea si no existe). Atómico frente a mensajes simultáneos gracias al
-- índice único parcial. Una sesión inactiva más de 24 h se cierra (su carrito pasa a `abandoned`), salvo
-- que esté esperando o revisando un pago: esas se conservan hasta 7 días para no perder el pedido.
create function public.get_or_create_session(p_tenant uuid, p_customer uuid)
returns public.conversation_sessions
language plpgsql security definer set search_path = '' as $$
declare
  s public.conversation_sessions;
  v_max interval;
begin
  select * into s from public.conversation_sessions
   where tenant_id = p_tenant and customer_id = p_customer and closed_at is null for update;
  if found then
    v_max := case when s.state in ('awaiting_proof', 'awaiting_review') then interval '7 days' else interval '24 hours' end;
    if coalesce(s.last_inbound_at, s.created_at) < now() - v_max then
      update public.carts set status = 'abandoned' where session_id = s.id and status = 'active';
      update public.conversation_sessions set state = 'closed', closed_at = now() where id = s.id;
    else
      return s;
    end if;
  end if;

  insert into public.conversation_sessions (tenant_id, customer_id, last_inbound_at, window_expires_at, expires_at)
  values (p_tenant, p_customer, now(), now() + interval '24 hours', now() + interval '24 hours')
  on conflict (tenant_id, customer_id) where closed_at is null do nothing
  returning * into s;
  if s.id is null then
    select * into s from public.conversation_sessions
     where tenant_id = p_tenant and customer_id = p_customer and closed_at is null;
  end if;
  return s;
end;
$$;

revoke execute on function public.set_whatsapp_account(uuid, text, text, text, text),
  public.set_whatsapp_status(uuid, public.whatsapp_status, text), public.get_whatsapp_credentials(uuid),
  public.get_or_create_session(uuid, uuid) from public, anon, authenticated;
grant execute on function public.set_whatsapp_account(uuid, text, text, text, text),
  public.set_whatsapp_status(uuid, public.whatsapp_status, text), public.get_whatsapp_credentials(uuid),
  public.get_or_create_session(uuid, uuid) to service_role;
