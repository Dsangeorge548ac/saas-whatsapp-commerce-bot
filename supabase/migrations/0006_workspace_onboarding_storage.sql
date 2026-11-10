-- 0006_workspace_onboarding_storage: notificaciones, límite de intentos anti fuerza bruta,
-- get_my_workspace(), progreso de configuración, activar/pausar el bot, menú base, Storage y Realtime.
--
-- Sensibles: auth_rate_limits (solo service role; claves SHA-256), buckets de Storage (privados y
-- SIN política SELECT: los archivos se sirven solo por /api/files tras autorizar).

-- ───────── Notificaciones (una fila por miembro; las crean solo los triggers) ─────────
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('order_new', 'proof_submitted', 'handoff_requested', 'whatsapp_error')),
  title text not null check (char_length(title) <= 120),      -- sin datos personales del cliente
  link text check (link ~ '^/'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create function public.notify_tenant_members(p_tenant uuid, p_kind text, p_title text, p_link text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (tenant_id, user_id, kind, title, link)
  select p_tenant, m.user_id, p_kind, p_title, p_link from public.tenant_members m where m.tenant_id = p_tenant;
$$;
revoke execute on function public.notify_tenant_members(uuid, text, text, text) from public, anon, authenticated;

create function public.trg_notify_order() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify_tenant_members(new.tenant_id, 'order_new', 'New order #' || new.order_number, '/orders');
  return new;
end; $$;
create function public.trg_notify_proof() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify_tenant_members(new.tenant_id, 'proof_submitted', 'Payment proof to review', '/orders');
  return new;
end; $$;
create function public.trg_notify_handoff() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.mode = 'human' and old.mode <> 'human' then
    perform public.notify_tenant_members(new.tenant_id, 'handoff_requested', 'A customer asked for an agent', '/chats');
  end if;
  return new;
end; $$;
revoke execute on function public.trg_notify_order(), public.trg_notify_proof(), public.trg_notify_handoff()
  from public, anon, authenticated;
create trigger orders_notify after insert on public.orders for each row execute function public.trg_notify_order();
create trigger payment_proofs_notify after insert on public.payment_proofs for each row execute function public.trg_notify_proof();
create trigger sessions_notify after update of mode on public.conversation_sessions
  for each row execute function public.trg_notify_handoff();

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy notifications_select on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = (select auth.uid()));

-- ───────── Límite de intentos propio (anti fuerza bruta; solo service role) ─────────
create table public.auth_rate_limits (
  scope text not null,                    -- 'login_email', 'login_ip', 'otp', 'register_ip'…
  key_hash text not null,                 -- SHA-256 del email/IP: nunca datos en claro
  attempts integer not null default 0,
  window_started_at timestamptz not null default now(),
  primary key (scope, key_hash)
);
alter table public.auth_rate_limits enable row level security;
revoke all on public.auth_rate_limits from anon, authenticated;

-- Registra un intento y dice si aún está permitido (true) o ya superó el máximo en la ventana (false).
create function public.take_attempt(p_scope text, p_key_hash text, p_max integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_attempts integer;
begin
  insert into public.auth_rate_limits as r (scope, key_hash, attempts, window_started_at)
  values (p_scope, p_key_hash, 1, now())
  on conflict (scope, key_hash) do update set
    attempts = case when r.window_started_at < now() - make_interval(secs => p_window_seconds) then 1 else r.attempts + 1 end,
    window_started_at = case when r.window_started_at < now() - make_interval(secs => p_window_seconds) then now() else r.window_started_at end
  returning attempts into v_attempts;
  return v_attempts <= p_max;
end; $$;
create function public.reset_attempts(p_scope text, p_key_hash text) returns void
language sql security definer set search_path = '' as $$
  delete from public.auth_rate_limits where scope = p_scope and key_hash = p_key_hash;
$$;
revoke execute on function public.take_attempt(text, text, integer, integer), public.reset_attempts(text, text)
  from public, anon, authenticated;
grant execute on function public.take_attempt(text, text, integer, integer), public.reset_attempts(text, text) to service_role;

-- ───────── Estado del área privada en UNA llamada ─────────
create function public.get_my_workspace() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'user', (select jsonb_build_object('id', p.id, 'email', p.email, 'first_name', p.first_name, 'last_name', p.last_name)
             from public.profiles p where p.id = (select auth.uid())),
    'platform_role', (select r.role from public.platform_roles r where r.user_id = (select auth.uid())),
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object('tenant_id', t.id, 'name', t.name, 'slug', t.slug, 'role', m.role,
                                          'status', t.status, 'billable', public.tenant_is_billable(t.id))
                       order by t.name)
      from public.tenant_members m join public.tenants t on t.id = m.tenant_id
      where m.user_id = (select auth.uid())), '[]'::jsonb),
    'unread_notifications', (select count(*) from public.notifications n
                             where n.user_id = (select auth.uid()) and n.read_at is null));
$$;
revoke execute on function public.get_my_workspace() from public, anon;
grant execute on function public.get_my_workspace() to authenticated;

-- ───────── Guía de configuración: el progreso se CALCULA con datos reales, no se marca a mano ─────────
create function public.get_onboarding_status(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_s public.tenant_settings;
  v_b public.tenant_branding;
  v_wa boolean; v_pay boolean; v_cat boolean; v_menu boolean; v_bill boolean; v_team boolean;
  v_block text[];
  v_steps jsonb := '[]'::jsonb;
begin
  if not public.is_tenant_member(p_tenant) then raise exception 'Not found' using errcode = 'P0002'; end if;
  select * into v_s from public.tenant_settings where tenant_id = p_tenant;
  select * into v_b from public.tenant_branding where tenant_id = p_tenant;
  v_wa := exists (select 1 from public.tenant_whatsapp_accounts where tenant_id = p_tenant and status = 'connected');
  v_pay := exists (select 1 from public.tenant_payment_methods where tenant_id = p_tenant and is_active);
  v_cat := exists (select 1 from public.products where tenant_id = p_tenant and is_available);
  v_menu := exists (select 1 from public.bot_menu_items i join public.bot_menus m on m.id = i.menu_id
                    where m.tenant_id = p_tenant and m.key = 'main');
  v_bill := public.tenant_is_billable(p_tenant);
  v_team := exists (select 1 from public.tenant_members where tenant_id = p_tenant and role = 'operator');

  v_block := array_remove(array[
    case when not v_wa then 'whatsapp' end, case when not v_pay then 'payment_methods' end,
    case when not v_cat then 'catalog' end, case when not v_bill then 'subscription' end], null);

  v_steps := jsonb_build_array(
    jsonb_build_object('key', 'business_profile', 'done', true, 'blocked_by', '[]'::jsonb),
    jsonb_build_object('key', 'branding', 'done', v_b.logo_path is not null, 'blocked_by', '[]'::jsonb),
    jsonb_build_object('key', 'whatsapp', 'done', v_wa, 'blocked_by', '[]'::jsonb),
    jsonb_build_object('key', 'payment_methods', 'done', v_pay, 'blocked_by', '[]'::jsonb),
    jsonb_build_object('key', 'catalog', 'done', v_cat, 'blocked_by', '[]'::jsonb),
    jsonb_build_object('key', 'bot_menus', 'done', v_menu, 'blocked_by', '[]'::jsonb),
    jsonb_build_object('key', 'bot_messages', 'done', v_s.messages_reviewed_at is not null, 'blocked_by', '[]'::jsonb),
    jsonb_build_object('key', 'test_bot', 'done', v_s.bot_tested_at is not null, 'blocked_by', '[]'::jsonb),
    jsonb_build_object('key', 'subscription', 'done', v_bill, 'blocked_by', '[]'::jsonb),
    jsonb_build_object('key', 'team', 'done', v_team,
                       'blocked_by', case when v_bill then '[]'::jsonb else '["subscription"]'::jsonb end),
    jsonb_build_object('key', 'go_live', 'done', v_s.bot_enabled, 'blocked_by', to_jsonb(v_block)));
  return jsonb_build_object('steps', v_steps, 'bot_enabled', v_s.bot_enabled);
end; $$;

-- Menú base editable (idempotente): pedido, información del negocio y asesor.
create function public.create_default_menu(p_tenant uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_menu uuid;
begin
  if not public.is_tenant_owner(p_tenant) then raise exception 'Not found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.bot_menus where tenant_id = p_tenant and key = 'main') then return; end if;
  insert into public.bot_menus (tenant_id, key, title, body)
  values (p_tenant, 'main', 'Menú principal', 'Elige una opción para continuar:') returning id into v_menu;
  insert into public.bot_menu_items (tenant_id, menu_id, title, description, action, sort_order) values
    (p_tenant, v_menu, 'Hacer un pedido', 'Ver productos y pedir', 'start_order', 1),
    (p_tenant, v_menu, 'Información', 'Horario y dirección', 'business_info', 2),
    (p_tenant, v_menu, 'Hablar con un asesor', null, 'request_agent', 3);
end; $$;

-- Activar el bot: solo el dueño, con suscripción vigente y lo mínimo configurado.
create function public.activate_bot(p_tenant uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_tenant_owner(p_tenant) then raise exception 'Not found' using errcode = 'P0002'; end if;
  if not public.tenant_is_billable(p_tenant) then raise exception 'SUBSCRIPTION_REQUIRED' using errcode = '42501'; end if;
  if not exists (select 1 from public.tenant_whatsapp_accounts where tenant_id = p_tenant and status = 'connected') then
    raise exception 'WHATSAPP_NOT_CONNECTED'; end if;
  if not exists (select 1 from public.tenant_payment_methods where tenant_id = p_tenant and is_active) then
    raise exception 'PAYMENT_METHOD_REQUIRED'; end if;
  if not exists (select 1 from public.products where tenant_id = p_tenant and is_available) then
    raise exception 'CATALOG_REQUIRED'; end if;
  update public.tenant_settings set bot_enabled = true, go_live_at = coalesce(go_live_at, now()) where tenant_id = p_tenant;
  perform public.log_audit((select auth.uid()), 'BOT_ACTIVATED', 'tenant_settings', p_tenant, null, null, '{}'::jsonb);
end; $$;

create function public.pause_bot(p_tenant uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_tenant_owner(p_tenant) then raise exception 'Not found' using errcode = 'P0002'; end if;
  update public.tenant_settings set bot_enabled = false where tenant_id = p_tenant;
  perform public.log_audit((select auth.uid()), 'BOT_PAUSED', 'tenant_settings', p_tenant, null, null, '{}'::jsonb);
end; $$;

revoke execute on function public.get_onboarding_status(uuid), public.create_default_menu(uuid),
  public.activate_bot(uuid), public.pause_bot(uuid) from public, anon;
grant execute on function public.get_onboarding_status(uuid), public.create_default_menu(uuid),
  public.activate_bot(uuid), public.pause_bot(uuid) to authenticated;

-- ───────── Storage: buckets PRIVADOS y sin política SELECT ─────────
-- Los archivos se entregan solo por /api/files/{kind}/{id}, que autoriza por sesión, transmite desde
-- el servidor y responde Cache-Control: no-store. Nunca se entregan URLs públicas ni firmadas.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('payment-proofs', 'payment-proofs', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('branding',       'branding',       false, 2097152,  array['image/jpeg', 'image/png', 'image/webp']),
  ('product-images', 'product-images', false, 5242880,  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Comprobantes: los sube el servidor (descarga de Meta con service role); sin política para usuarios.
-- Marca y producto: el dueño sube solo dentro de la carpeta de su comercio {tenant_id}/...
create policy branding_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and case when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    then public.is_tenant_owner(((storage.foldername(name))[1])::uuid) else false end);
create policy product_images_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and case when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    then public.is_tenant_owner(((storage.foldername(name))[1])::uuid) else false end);

-- ───────── Realtime (RLS aplica: cada comercio solo recibe lo suyo) ─────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.orders, public.messages,
      public.conversation_sessions, public.payment_proofs, public.notifications;
  end if;
end $$;
