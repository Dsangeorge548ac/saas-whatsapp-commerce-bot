-- 0020: datos del panel /admin/subscriptions (solo staff de plataforma, solo lectura).
--   * admin_list_subscriptions: comercios con suscripción de Stripe o acceso de cortesía, con su dueño, plan,
--     estado, periodo y último pago. Búsqueda (literal) por comercio, nombre o correo del dueño; filtros por estado
--     visible y por plan; paginación en la base.
--   * admin_subscription_kpis: cuántos hay por plan y periodo (para calcular el ingreso mensual en la app),
--     cobrado y reembolsado este mes, no renovados, terminados, de cortesía y renovaciones en 7 días.
-- Sin datos de clientes finales. Las ESCRITURAS no van aquí: pasan por Stripe (Server Actions + sincronización).

create function public.admin_list_subscriptions(p_search text, p_status text, p_plan text, p_limit integer, p_offset integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_search text := nullif(btrim(coalesce(p_search, '')), ''); v_total bigint; v_rows jsonb;
begin
  if not public.is_platform_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_status not in ('all', 'active', 'canceling', 'issue', 'ended', 'complimentary') then raise exception 'INVALID_FILTER'; end if;
  if p_plan not in ('all', 'starter', 'pro', 'business') then raise exception 'INVALID_FILTER'; end if;
  p_limit := least(greatest(coalesce(p_limit, 20), 1), 100);
  p_offset := greatest(coalesce(p_offset, 0), 0);
  if v_search is not null then
    v_search := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  with base as (
    select s.tenant_id, t.name as tenant_name, t.status::text as tenant_status, s.plan_id, pl.name as plan_name,
           s.status::text as status, s.billing_interval, s.activated_at, s.current_period_end, s.cancel_at_period_end,
           s.canceled_at, s.comp_access_until, s.stripe_subscription_id is not null as has_stripe,
           o.id as owner_id, o.first_name || ' ' || o.last_name as owner_name, o.email::text as owner_email,
           case
             when s.status in ('active', 'trialing') then case when s.cancel_at_period_end then 'canceling' else 'active' end
             when s.comp_access_until > now() then 'complimentary'
             when s.status in ('past_due', 'unpaid') then 'issue'
             when s.status in ('canceled', 'incomplete_expired') then 'ended'
             else 'other' end as view,
           (select jsonb_build_object('status', pa.status::text, 'amount_cents', pa.amount_cents, 'at', coalesce(pa.paid_at, pa.created_at))
              from public.payments pa where pa.tenant_id = s.tenant_id order by pa.created_at desc limit 1) as last_payment,
           s.updated_at
      from public.tenant_subscriptions s
      join public.tenants t on t.id = s.tenant_id
      join public.plans pl on pl.id = s.plan_id
      left join lateral (select p.* from public.tenant_members m join public.profiles p on p.id = m.user_id
                          where m.tenant_id = s.tenant_id and m.role = 'owner' order by m.created_at limit 1) o on true
     where (s.stripe_subscription_id is not null or s.comp_access_until is not null)
  ), page as (
    select * from base
     where (v_search is null or tenant_name ilike v_search or owner_name ilike v_search or owner_email ilike v_search)
       and (p_status = 'all' or view = p_status)
       and (p_plan = 'all' or plan_id = p_plan)
  ), cut as (select * from page order by updated_at desc, tenant_id limit p_limit offset p_offset)
  select (select count(*) from page), coalesce((select jsonb_agg(to_jsonb(cut) - 'updated_at' order by cut.updated_at desc, cut.tenant_id) from cut), '[]'::jsonb)
    into v_total, v_rows;
  return jsonb_build_object('total', v_total, 'rows', v_rows);
end;
$$;

create function public.admin_subscription_kpis()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_month timestamptz := date_trunc('month', now()); v jsonb;
begin
  if not public.is_platform_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select jsonb_build_object(
    'active_by_plan', coalesce((
      select jsonb_agg(jsonb_build_object('plan_id', plan_id, 'interval', coalesce(billing_interval, 'monthly'), 'count', n))
        from (select plan_id, billing_interval, count(*) as n from public.tenant_subscriptions
               where status in ('active', 'trialing') and stripe_subscription_id is not null
               group by plan_id, billing_interval) x), '[]'::jsonb),
    'renewing_soon', (select count(*) from public.tenant_subscriptions where status in ('active', 'trialing') and not cancel_at_period_end
                        and current_period_end between now() and now() + interval '7 days'),
    'issues', (select count(*) from public.tenant_subscriptions where status in ('past_due', 'unpaid')),
    'ended', (select count(*) from public.tenant_subscriptions where status in ('canceled', 'incomplete_expired') and stripe_subscription_id is not null),
    'complimentary', (select count(*) from public.tenant_subscriptions where comp_access_until > now() and status not in ('active', 'trialing')),
    'paid_this_month_cents', (select coalesce(sum(amount_cents), 0) from public.payments where status = 'paid' and paid_at >= v_month),
    'refunded_this_month_cents', (select coalesce(sum(amount_cents), 0) from public.payments where status = 'refunded' and coalesce(paid_at, created_at) >= v_month))
  into v;
  return v;
end;
$$;

revoke execute on function public.admin_list_subscriptions(text, text, text, integer, integer), public.admin_subscription_kpis() from public, anon;
grant execute on function public.admin_list_subscriptions(text, text, text, integer, integer), public.admin_subscription_kpis() to authenticated;
