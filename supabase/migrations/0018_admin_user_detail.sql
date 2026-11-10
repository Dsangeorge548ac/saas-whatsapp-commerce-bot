-- 0018: detalle de usuario más completo para /admin/users/[id] (al estilo de Tax Pro): correo verificado,
-- comercio con su plan y estado de suscripción. Mismas reglas: solo el staff de plataforma; sin datos de
-- clientes finales. La actividad se lee de audit_logs, cuya RLS ya permite la lectura al staff.
create or replace function public.admin_get_user(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not public.is_platform_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select jsonb_build_object('id', p.id, 'email', p.email::text, 'first_name', p.first_name, 'last_name', p.last_name,
           'created_at', p.created_at, 'platform_role', pr.role::text,
           'tenant_id', t.id, 'tenant_name', t.name, 'tenant_slug', t.slug::text, 'tenant_role', tm.role::text,
           'tenant_status', t.status::text, 'member_since', tm.created_at,
           'plan_name', pl.name, 'subscription_status', s.status::text, 'current_period_end', s.current_period_end,
           'comp_access_until', s.comp_access_until,
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
revoke execute on function public.admin_get_user(uuid) from public, anon;
grant execute on function public.admin_get_user(uuid) to authenticated;
