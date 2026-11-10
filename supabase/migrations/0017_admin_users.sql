-- 0017: gestión de usuarios de la PLATAFORMA (/admin/users).
--   * admin_list_users: lista paginada para el staff (platform_admin y developer). Solo datos de cuentas
--     (nombre, correo, rol, comercio, estado); nunca datos de clientes finales.
--   * admin_update_user_name / admin_set_platform_role / admin_set_user_disabled: solo `developer`.
--     No se puede actuar sobre uno mismo (evita quedarse sin acceso). Inhabilitar cierra todas sus sesiones.
-- Todas validan el rol DENTRO de la base (no confían en la app) y usan search_path vacío.

create function public.admin_list_users(p_search text, p_filter text, p_limit integer, p_offset integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_search text := nullif(btrim(coalesce(p_search, '')), ''); v_total bigint; v_rows jsonb;
begin
  if not public.is_platform_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_filter not in ('all', 'staff', 'owners', 'operators', 'disabled') then raise exception 'INVALID_FILTER'; end if;
  p_limit := least(greatest(coalesce(p_limit, 20), 1), 100);
  p_offset := greatest(coalesce(p_offset, 0), 0);
  if v_search is not null then
    -- Se escapan los comodines de LIKE para que la búsqueda sea literal.
    v_search := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  with page as (
    select p.id, p.email::text as email, p.first_name, p.last_name, p.created_at,
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

create function public.admin_get_user(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not public.is_platform_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select jsonb_build_object('id', p.id, 'email', p.email::text, 'first_name', p.first_name, 'last_name', p.last_name,
           'created_at', p.created_at, 'platform_role', pr.role::text, 'tenant_name', t.name, 'tenant_role', tm.role::text,
           'tenant_status', t.status::text,
           'disabled', (u.banned_until is not null and u.banned_until > now()),
           'last_sign_in_at', u.last_sign_in_at)
    into v
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.platform_roles pr on pr.user_id = p.id
    left join public.tenant_members tm on tm.user_id = p.id
    left join public.tenants t on t.id = tm.tenant_id
   where p.id = p_user;
  return v;
end;
$$;

create function public.admin_update_user_name(p_user uuid, p_first text, p_last text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_developer() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  p_first := btrim(coalesce(p_first, '')); p_last := btrim(coalesce(p_last, ''));
  if char_length(p_first) not between 1 and 80 or char_length(p_last) not between 1 and 80 then raise exception 'INVALID_NAME'; end if;
  update public.profiles set first_name = p_first, last_name = p_last where id = p_user;
  if not found then raise exception 'NOT_FOUND'; end if;
end;
$$;

-- p_role = null quita el rol de plataforma.
create function public.admin_set_platform_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_developer() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_user = (select auth.uid()) then raise exception 'CANNOT_CHANGE_SELF'; end if;
  if p_role is not null and p_role not in ('developer', 'platform_admin') then raise exception 'INVALID_ROLE'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'NOT_FOUND'; end if;
  if p_role is null then
    delete from public.platform_roles where user_id = p_user;
  else
    insert into public.platform_roles (user_id, role, granted_by) values (p_user, p_role::public.platform_role, (select auth.uid()))
    on conflict (user_id) do update set role = excluded.role, granted_by = excluded.granted_by;
  end if;
end;
$$;

-- Inhabilitar = bloquear el inicio de sesión (banned_until) y cerrar todas sus sesiones al instante.
create function public.admin_set_user_disabled(p_user uuid, p_disabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_developer() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_user = (select auth.uid()) then raise exception 'CANNOT_CHANGE_SELF'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'NOT_FOUND'; end if;
  update auth.users set banned_until = case when p_disabled then 'infinity'::timestamptz else null end where id = p_user;
  if p_disabled then delete from auth.sessions where user_id = p_user; end if;
end;
$$;

revoke execute on function public.admin_list_users(text, text, integer, integer), public.admin_get_user(uuid),
  public.admin_update_user_name(uuid, text, text), public.admin_set_platform_role(uuid, text),
  public.admin_set_user_disabled(uuid, boolean) from public, anon;
grant execute on function public.admin_list_users(text, text, integer, integer), public.admin_get_user(uuid),
  public.admin_update_user_name(uuid, text, text), public.admin_set_platform_role(uuid, text),
  public.admin_set_user_disabled(uuid, boolean) to authenticated;
