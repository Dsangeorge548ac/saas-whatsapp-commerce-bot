-- Pruebas de 0020 (panel de suscripciones del staff). Termina con ALL_0020_TESTS_PASSED, que revierte todo.
create schema tests;
create function tests.assert(c boolean, label text) returns void language plpgsql as $$
begin if c is not true then raise exception 'FAILED: %', label; end if; end $$;
create function tests.val_as(uid uuid, q text, r text default 'authenticated') returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', case when uid is null then '' else json_build_object('sub', uid, 'role', r)::text end, true);
  execute format('set local role %I', r);
  begin execute q into v; reset role; perform set_config('request.jwt.claims', '', true); return coalesce(nullif(v, ''), 'ok');
  exception when others then reset role; perform set_config('request.jwt.claims', '', true); return 'ERR:' || sqlerrm; end;
end $$;

do $$
declare adm uuid := gen_random_uuid(); own uuid := gen_random_uuid(); own2 uuid := gen_random_uuid(); t uuid; t2 uuid; r jsonb;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email, now(), '{}'::jsonb, now(), now()
  from (values (adm,'adm@t.test'),(own,'zz-own@t.test'),(own2,'zz-own2@t.test')) as u(id, email);
  insert into public.platform_roles (user_id, role) values (adm, 'platform_admin');
  t := tests.val_as(own, $q$select public.create_tenant('ZZ Panadería Paga','store')$q$)::uuid;
  t2 := tests.val_as(own2, $q$select public.create_tenant('ZZ Cortesía','store')$q$)::uuid;
  insert into public.tenant_subscriptions (tenant_id, plan_id, status, stripe_subscription_id, billing_interval, current_period_end)
  values (t, 'pro', 'active', 'sub_zz_test', 'yearly', now() + interval '3 days'),
         (t2, 'business', 'incomplete', null, null, null);
  update public.tenant_subscriptions set comp_access_until = now() + interval '10 days' where tenant_id = t2;
  insert into public.payments (tenant_id, stripe_invoice_id, amount_cents, currency, status, paid_at)
  values (t, 'in_zz_test', 48800, 'usd', 'paid', now());

  -- Solo el staff.
  perform tests.assert(tests.val_as(own, $q$select public.admin_list_subscriptions(null,'all','all',20,0)::text$q$) like 'ERR:FORBIDDEN%', 'owner cannot list');
  perform tests.assert(tests.val_as(own, $q$select public.admin_subscription_kpis()::text$q$) like 'ERR:FORBIDDEN%', 'owner cannot see kpis');
  perform tests.assert(tests.val_as(null, $q$select public.admin_subscription_kpis()::text$q$, 'anon') like 'ERR:permission denied%', 'anon blocked');

  r := tests.val_as(adm, $q$select public.admin_list_subscriptions('ZZ ','all','all',20,0)::text$q$)::jsonb;
  perform tests.assert((r->>'total')::int = 2, 'lists paid + complimentary');
  r := tests.val_as(adm, $q$select public.admin_list_subscriptions('ZZ','complimentary','all',20,0)::text$q$)::jsonb;
  perform tests.assert((r->>'total')::int = 1 and r->'rows'->0->>'plan_id' = 'business', 'complimentary filter');
  r := tests.val_as(adm, $q$select public.admin_list_subscriptions('zz-own@t.test','active','pro',20,0)::text$q$)::jsonb;
  perform tests.assert((r->>'total')::int = 1 and (r->'rows'->0->'last_payment'->>'amount_cents')::int = 48800, 'owner email search + last payment');
  perform tests.assert(tests.val_as(adm, $q$select public.admin_list_subscriptions(null,'weird','all',20,0)::text$q$) like 'ERR:INVALID_FILTER%', 'invalid filter');

  r := tests.val_as(adm, $q$select public.admin_subscription_kpis()::text$q$)::jsonb;
  perform tests.assert((r->>'paid_this_month_cents')::int >= 48800, 'collected this month');
  perform tests.assert((r->>'complimentary')::int >= 1 and (r->>'renewing_soon')::int >= 1, 'counts');
  perform tests.assert(exists (select 1 from jsonb_array_elements(r->'active_by_plan') e where e->>'plan_id' = 'pro' and e->>'interval' = 'yearly'), 'by plan and interval');

  raise exception 'ALL_0020_TESTS_PASSED';
end $$;
