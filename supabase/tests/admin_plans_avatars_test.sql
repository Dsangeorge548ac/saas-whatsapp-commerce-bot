-- Pruebas de 0019 (foto de perfil, edición de cuentas y planes asignados por el developer).
-- Termina con el error intencional ALL_0019_TESTS_PASSED, que revierte todo.

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
declare dev uuid := gen_random_uuid(); own uuid := gen_random_uuid(); other uuid := gen_random_uuid(); t uuid; t2 uuid;
  good_path text; bad_path text;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email, now(), '{}'::jsonb, now(), now()
  from (values (dev,'dev@t.test'),(own,'own@t.test'),(other,'other@t.test')) as u(id, email);
  insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
  values (gen_random_uuid(), own, own::text, 'email', jsonb_build_object('sub', own::text, 'email', 'own@t.test'), now(), now());
  insert into public.platform_roles (user_id, role) values (dev, 'developer');
  t := tests.val_as(own, $q$select public.create_tenant('Panadería Sol','store')$q$)::uuid;
  t2 := tests.val_as(other, $q$select public.create_tenant('Otro','store')$q$)::uuid;

  -- Foto de perfil: solo una ruta dentro de la carpeta propia, y solo en la fila propia.
  good_path := own::text || '/avatar-' || gen_random_uuid()::text || '.webp';
  bad_path := other::text || '/avatar-' || gen_random_uuid()::text || '.webp';
  perform tests.assert(tests.val_as(own, format($q$update public.profiles set avatar_path = %L where id = %L returning 'ok'$q$, good_path, own)) = 'ok', 'own avatar saved');
  perform tests.assert((select avatar_path from public.profiles where id = own) = good_path, 'avatar stored');
  perform tests.assert(tests.val_as(own, format($q$update public.profiles set avatar_path = %L where id = %L returning 'ok'$q$, bad_path, own)) like 'ERR:%check%', 'foreign folder rejected');
  perform tests.assert(tests.val_as(own, $q$update public.profiles set avatar_path = '../x.webp' returning 'ok'$q$) like 'ERR:%', 'path traversal rejected');
  perform tests.val_as(own, format($q$update public.profiles set avatar_path = null where id = %L returning 'ok'$q$, other));
  perform tests.assert((select avatar_path from public.profiles where id = other) is null, 'cannot touch another profile');
  perform tests.assert((tests.val_as(own, $q$select public.get_my_workspace()->'user'->>'avatar_path'$q$)) = good_path, 'workspace returns avatar');

  -- Solo el developer usa las funciones nuevas.
  perform tests.assert(tests.val_as(own, format($q$select public.admin_assign_plan(%L,'business', now() + interval '30 days')$q$, t)) like 'ERR:FORBIDDEN%', 'owner cannot self-assign');
  perform tests.assert(tests.val_as(own, format($q$select public.admin_update_user(%L,'A','B','x@t.test',true)$q$, own)) like 'ERR:FORBIDDEN%', 'owner cannot admin-edit');
  perform tests.assert(tests.val_as(null, format($q$select public.admin_update_tenant(%L,'X','active')$q$, t), 'anon') like 'ERR:permission denied%', 'anon blocked');

  -- Asignar plan de cortesía: el comercio pasa a facturable con los límites del plan.
  perform tests.assert(not public.tenant_is_billable(t), 'not billable before');
  perform tests.assert(tests.val_as(dev, format($q$select public.admin_assign_plan(%L,'business', now() + interval '30 days')$q$, t)) = 'ok', 'dev assigns plan');
  perform tests.assert(public.tenant_is_billable(t), 'billable after assign');
  perform tests.assert((select plan_id from public.tenant_subscriptions where tenant_id = t) = 'business', 'plan stored');
  perform tests.assert(tests.val_as(dev, format($q$select public.admin_assign_plan(%L,'gold', now() + interval '30 days')$q$, t)) like 'ERR:INVALID_PLAN%', 'unknown plan');
  perform tests.assert(tests.val_as(dev, format($q$select public.admin_assign_plan(%L,'pro', now() - interval '1 day')$q$, t)) like 'ERR:INVALID_DATE%', 'past date');
  perform tests.assert(tests.val_as(dev, format($q$select public.admin_assign_plan(%L,'pro', now() + interval '6 years')$q$, t)) like 'ERR:INVALID_DATE%', 'too far');
  perform tests.assert(tests.val_as(dev, format($q$select public.admin_assign_plan(%L,'pro', null)$q$, t)) = 'ok', 'dev removes access');
  perform tests.assert(not public.tenant_is_billable(t), 'not billable after removal');
  update public.tenant_subscriptions set stripe_subscription_id = 'sub_test', status = 'active' where tenant_id = t;
  perform tests.assert(tests.val_as(dev, format($q$select public.admin_assign_plan(%L,'business', now() + interval '30 days')$q$, t)) like 'ERR:HAS_STRIPE_SUBSCRIPTION%', 'live stripe sub wins');

  -- Editar la cuenta: nombre, correo (se sincroniza a profiles e identities) y verificación.
  perform tests.assert(tests.val_as(dev, format($q$select public.admin_update_user(%L,' Ana ','Sol','NEW@t.test',false)$q$, own)) = 'ok', 'dev edits user');
  perform tests.assert((select email::text from public.profiles where id = own) = 'new@t.test', 'profile email synced');
  perform tests.assert((select email_confirmed_at from auth.users where id = own) is null, 'unverified');
  perform tests.assert((select identity_data->>'email' from auth.identities where user_id = own) = 'new@t.test', 'identity synced');
  perform tests.assert((select first_name from public.profiles where id = own) = 'Ana', 'name trimmed');
  perform tests.assert(tests.val_as(dev, format($q$select public.admin_update_user(%L,'A','B','other@t.test',true)$q$, own)) like 'ERR:EMAIL_TAKEN%', 'email taken');
  perform tests.assert(tests.val_as(dev, format($q$select public.admin_update_user(%L,'A','B','not-an-email',true)$q$, own)) like 'ERR:INVALID_EMAIL%', 'invalid email');

  -- Editar el comercio: nombre y suspensión (sin acceso mientras está suspendido).
  perform tests.assert(tests.val_as(dev, format($q$select public.admin_update_tenant(%L,'Sol Bakery','suspended')$q$, t)) = 'ok', 'dev suspends');
  perform tests.assert(not public.tenant_is_billable(t), 'suspended is not billable');
  perform tests.assert((select name from public.tenants where id = t) = 'Sol Bakery', 'tenant renamed');
  perform tests.assert(tests.val_as(dev, format($q$select public.admin_update_tenant(%L,'X','closed')$q$, t)) like 'ERR:INVALID_%', 'invalid tenant input');

  raise exception 'ALL_0019_TESTS_PASSED';
end $$;
