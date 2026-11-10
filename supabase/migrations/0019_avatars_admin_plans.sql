-- 0019: foto de perfil, periodo de facturación y más poderes del developer sobre cuentas y planes.
--
--   * Foto de perfil: bucket PRIVADO `avatars`; cada usuario sube solo dentro de su carpeta {uid}/ y guarda la
--     ruta en profiles.avatar_path (GRANT por columna + CHECK que obliga a que la ruta sea de su carpeta). Se
--     entrega solo por /api/files/avatar/{userId}, que autoriza con la sesión (RLS de profiles).
--   * tenant_subscriptions.billing_interval: mensual o anual (lo llena la sincronización con Stripe).
--   * admin_update_user: el developer edita nombre, correo y si está verificado.
--   * admin_update_tenant: el developer edita el nombre del comercio y lo suspende o reactiva.
--   * admin_assign_plan: el developer asigna cualquier plan como ACCESO DE CORTESÍA hasta una fecha (o lo
--     quita). No se permite si el comercio tiene una suscripción viva en Stripe: esa se cambia en Stripe.
--   * admin_list_users / admin_get_user devuelven también la foto y el periodo.
-- Todas validan el rol dentro de la base (no confían en la app) y usan search_path vacío.

-- ───────── Foto de perfil ─────────
alter table public.profiles add column avatar_path text
  check (avatar_path is null or (avatar_path ~ '^[0-9a-f-]{36}/avatar-[0-9a-f-]{36}\.(webp|jpg|png)$'
                                 and split_part(avatar_path, '/', 1) = id::text));
grant update (avatar_path) on public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Subir y borrar SOLO dentro de la carpeta propia. Sin política SELECT: se sirve por la ruta del servidor.
create policy avatars_own_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_own_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- El workspace (una sola llamada) incluye la foto para el riel y el menú de cuenta.
create or replace function public.get_my_workspace() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'user', (select jsonb_build_object('id', p.id, 'email', p.email, 'first_name', p.first_name, 'last_name', p.last_name,
                                       'avatar_path', p.avatar_path)
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

-- ───────── Periodo de facturación ─────────
alter table public.tenant_subscriptions add column billing_interval text check (billing_interval in ('monthly', 'yearly'));

-- ───────── Developer: editar la cuenta ─────────
create function public.admin_update_user(p_user uuid, p_first text, p_last text, p_email text, p_email_confirmed boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.is_developer() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  p_first := btrim(coalesce(p_first, '')); p_last := btrim(coalesce(p_last, ''));
  if char_length(p_first) not between 1 and 80 or char_length(p_last) not between 1 and 80 then raise exception 'INVALID_NAME'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then raise exception 'INVALID_EMAIL'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'NOT_FOUND'; end if;
  if exists (select 1 from auth.users where lower(email) = v_email and id <> p_user) then raise exception 'EMAIL_TAKEN'; end if;

  update public.profiles set first_name = p_first, last_name = p_last where id = p_user;
  -- El correo vive en Auth; el trigger on_auth_user_email_changed copia el nuevo a profiles.
  update auth.users
     set email = v_email,
         email_confirmed_at = case when p_email_confirmed then coalesce(email_confirmed_at, now()) else null end,
         email_change = '', email_change_token_new = '', email_change_token_current = ''
   where id = p_user;
  update auth.identities
     set identity_data = jsonb_set(identity_data, '{email}', to_jsonb(v_email)), updated_at = now()
   where user_id = p_user and provider = 'email';
end;
$$;

create function public.admin_update_tenant(p_tenant uuid, p_name text, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_developer() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  p_name := btrim(coalesce(p_name, ''));
  if char_length(p_name) not between 2 and 120 then raise exception 'INVALID_NAME'; end if;
  if p_status not in ('active', 'suspended') then raise exception 'INVALID_STATUS'; end if;
  update public.tenants set name = p_name, status = p_status::public.tenant_status where id = p_tenant;
  if not found then raise exception 'NOT_FOUND'; end if;
end;
$$;

-- p_until = null quita el acceso de cortesía (el plan anotado se conserva como referencia).
create function public.admin_assign_plan(p_tenant uuid, p_plan text, p_until timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare v_sub public.tenant_subscriptions;
begin
  if not public.is_developer() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if not exists (select 1 from public.tenants where id = p_tenant) then raise exception 'NOT_FOUND'; end if;
  if not exists (select 1 from public.plans where id = p_plan and is_active) then raise exception 'INVALID_PLAN'; end if;
  if p_until is not null and (p_until <= now() or p_until > now() + interval '5 years') then raise exception 'INVALID_DATE'; end if;

  select * into v_sub from public.tenant_subscriptions where tenant_id = p_tenant;
  -- Una suscripción viva de Stripe manda: su plan se cambia en Stripe (si no, el webhook lo pisaría).
  if v_sub.stripe_subscription_id is not null and v_sub.status in ('active', 'trialing', 'past_due', 'unpaid') then
    raise exception 'HAS_STRIPE_SUBSCRIPTION';
  end if;

  insert into public.tenant_subscriptions (tenant_id, plan_id, status, comp_access_until)
  values (p_tenant, p_plan, 'incomplete', p_until)
  on conflict (tenant_id) do update set plan_id = excluded.plan_id, comp_access_until = excluded.comp_access_until;
end;
$$;

-- ───────── Lectura del staff: foto y periodo ─────────
create or replace function public.admin_list_users(p_search text, p_filter text, p_limit integer, p_offset integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_search text := nullif(btrim(coalesce(p_search, '')), ''); v_total bigint; v_rows jsonb;
begin
  if not public.is_platform_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_filter not in ('all', 'staff', 'owners', 'operators', 'disabled') then raise exception 'INVALID_FILTER'; end if;
  p_limit := least(greatest(coalesce(p_limit, 20), 1), 100);
  p_offset := greatest(coalesce(p_offset, 0), 0);
  if v_search is not null then
    v_search := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  with page as (
    select p.id, p.email::text as email, p.first_name, p.last_name, p.created_at, p.avatar_path,
           pr.role::text as platform_role, t.name as tenant_name, tm.role::text as tenant_role,
           (u.banned_until is not null and u.banned_until > now()) as disabled
      from public.profiles p
      join auth.users u on u.id = p.id
      left join public.platform_roles pr on pr.user_id = p.id
      left join public.tenant_members tm on tm.user_id = p.id
      left join public.tenants t on t.id = tm.tenant_id
     where (v_search is null or p.email::text ilike v_search or (p.first_name || ' ' || p.last_name) ilike v_search)
       and case p_filter
             when 'staff' then pr.role is not null
             when 'owners' then tm.role = 'owner'
             when 'operators' then tm.role = 'operator'
             when 'disabled' then (u.banned_until is not null and u.banned_until > now())
             else true end
  ), cut as (select * from page order by created_at desc, id limit p_limit offset p_offset)
  select (select count(*) from page), coalesce((select jsonb_agg(to_jsonb(cut) order by cut.created_at desc, cut.id) from cut), '[]'::jsonb)
    into v_total, v_rows;
  return jsonb_build_object('total', v_total, 'rows', v_rows);
end;
$$;

create or replace function public.admin_get_user(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not public.is_platform_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select jsonb_build_object('id', p.id, 'email', p.email::text, 'first_name', p.first_name, 'last_name', p.last_name,
           'created_at', p.created_at, 'avatar_path', p.avatar_path, 'platform_role', pr.role::text,
           'tenant_id', t.id, 'tenant_name', t.name, 'tenant_slug', t.slug::text, 'tenant_role', tm.role::text,
           'tenant_status', t.status::text, 'member_since', tm.created_at,
           'plan_id', s.plan_id, 'plan_name', pl.name, 'subscription_status', s.status::text,
           'billing_interval', s.billing_interval, 'has_stripe_subscription', s.stripe_subscription_id is not null,
           'cancel_at_period_end', coalesce(s.cancel_at_period_end, false),
           'current_period_end', s.current_period_end, 'comp_access_until', s.comp_access_until,
           'email_confirmed', u.email_confirmed_at is not null,
           'disabled', (u.banned_until is not null and u.banned_until > now()),
           'last_sign_in_at', u.last_sign_in_at)
    into v
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.platform_roles pr on pr.user_id = p.id
    left join public.tenant_members tm on tm.user_id = p.id
    left join public.tenants t on t.id = tm.tenant_id
    left join public.tenant_subscriptions s on s.tenant_id = t.id
    left join public.plans pl on pl.id = s.plan_id
   where p.id = p_user
   limit 1;
  return v;
end;
$$;

revoke execute on function public.admin_update_user(uuid, text, text, text, boolean), public.admin_update_tenant(uuid, text, text),
  public.admin_assign_plan(uuid, text, timestamptz), public.admin_list_users(text, text, integer, integer),
  public.admin_get_user(uuid), public.get_my_workspace() from public, anon;
grant execute on function public.admin_update_user(uuid, text, text, text, boolean), public.admin_update_tenant(uuid, text, text),
  public.admin_assign_plan(uuid, text, timestamptz), public.admin_list_users(text, text, integer, integer),
  public.admin_get_user(uuid), public.get_my_workspace() to authenticated;
