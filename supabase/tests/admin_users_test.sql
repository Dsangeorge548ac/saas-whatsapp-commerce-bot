-- Pruebas de la gestión de usuarios de plataforma (0017). Termina con el error intencional
-- ALL_ADMIN_USERS_TESTS_PASSED, que revierte todo.

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
declare dev uuid := gen_random_uuid(); adm uuid := gen_random_uuid(); plain uuid := gen_random_uuid(); r text;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email, now(), '{}'::jsonb, now(), now()
  from (values (dev,'dev@t.test'),(adm,'adm@t.test'),(plain,'plain@t.test')) as u(id, email);
  insert into public.platform_roles (user_id, role) values (dev, 'developer'), (adm, 'platform_admin');
  insert into auth.sessions (id, user_id, created_at, updated_at) values (gen_random_uuid(), plain, now(), now());

  -- Un usuario normal no puede listar ni consultar ni modificar nada.
  perform tests.assert(tests.val_as(plain, $q$select public.admin_list_users(null,'all',20,0)::text$q$) like 'ERR:FORBIDDEN%', 'plain cannot list');
  perform tests.assert(tests.val_as(plain, format($q$select public.admin_get_user(%L)::text$q$, dev)) like 'ERR:FORBIDDEN%', 'plain cannot get');
  perform tests.assert(tests.val_as(plain, format($q$select public.admin_set_platform_role(%L,'developer')::text$q$, plain)) like 'ERR:FORBIDDEN%', 'plain cannot self-promote');
  perform tests.assert(tests.val_as(null, $q$select public.admin_list_users(null,'all',20,0)::text$q$, 'anon') like 'ERR:permission denied%', 'anon cannot execute');

  -- El platform_admin lista (solo lectura), pero no modifica.
  perform tests.assert((tests.val_as(adm, $q$select (public.admin_list_users('@t.test','all',20,0)->>'total')$q$))::int = 3, 'admin lists 3');
  perform tests.assert((tests.val_as(adm, $q$select (public.admin_list_users('plain','all',20,0)->>'total')$q$))::int = 1, 'search by email');
  perform tests.assert((tests.val_as(adm, $q$select (public.admin_list_users('%','all',20,0)->>'total')$q$))::int = 0, 'wildcards are literal');
  perform tests.assert((tests.val_as(adm, $q$select (public.admin_list_users('@t.test','staff',20,0)->>'total')$q$))::int = 2, 'staff filter');
  perform tests.assert(tests.val_as(adm, $q$select public.admin_list_users(null,'x',20,0)::text$q$) like 'ERR:INVALID_FILTER%', 'invalid filter');
  perform tests.assert(tests.val_as(adm, format($q$select public.admin_update_user_name(%L,'A','B')::text$q$, plain)) like 'ERR:FORBIDDEN%', 'admin cannot edit');
  perform tests.assert(tests.val_as(adm, format($q$select public.admin_set_user_disabled(%L,true)::text$q$, plain)) like 'ERR:FORBIDDEN%', 'admin cannot disable');

  -- El developer edita, asigna roles e inhabilita; no puede actuar sobre sí mismo.
  perform tests.assert(tests.val_as(dev, format($q$select public.admin_update_user_name(%L,'  Ana ','Pérez')$q$, plain)) = 'ok', 'dev edits name');
  perform tests.assert((select first_name from public.profiles where id = plain) = 'Ana', 'name trimmed and saved');
  perform tests.assert(tests.val_as(dev, format($q$select public.admin_update_user_name(%L,'','x')$q$, plain)) like 'ERR:INVALID_NAME%', 'empty name rejected');
  perform tests.assert(tests.val_as(dev, format($q$select public.admin_set_platform_role(%L,'platform_admin')$q$, plain)) = 'ok', 'dev grants role');
  perform tests.assert((select role::text from public.platform_roles where user_id = plain) = 'platform_admin', 'role stored');
  perform tests.assert(tests.val_as(dev, format($q$select public.admin_set_platform_role(%L,'root')$q$, plain)) like 'ERR:INVALID_ROLE%', 'invalid role');
  perform tests.assert(tests.val_as(dev, format($q$select public.admin_set_platform_role(%L,null)$q$, plain)) = 'ok', 'dev removes role');
  perform tests.assert(not exists (select 1 from public.platform_roles where user_id = plain), 'role removed');
  perform tests.assert(tests.val_as(dev, format($q$select public.admin_set_platform_role(%L,null)$q$, dev)) like 'ERR:CANNOT_CHANGE_SELF%', 'no self role change');
  perform tests.assert(tests.val_as(dev, format($q$select public.admin_set_user_disabled(%L,true)$q$, dev)) like 'ERR:CANNOT_CHANGE_SELF%', 'no self disable');
  perform tests.assert(tests.val_as(dev, format($q$select public.admin_set_user_disabled(%L,true)$q$, plain)) = 'ok', 'dev disables');
  perform tests.assert((select banned_until from auth.users where id = plain) > now(), 'banned');
  perform tests.assert(not exists (select 1 from auth.sessions where user_id = plain), 'sessions closed');
  perform tests.assert((tests.val_as(adm, $q$select (public.admin_list_users('@t.test','disabled',20,0)->>'total')$q$))::int = 1, 'disabled filter');
  perform tests.assert(tests.val_as(dev, format($q$select public.admin_set_user_disabled(%L,false)$q$, plain)) = 'ok', 'dev re-enables');
  perform tests.assert((select banned_until from auth.users where id = plain) is null, 'unbanned');
  perform tests.assert(tests.val_as(dev, format($q$select public.admin_set_user_disabled(%L,true)$q$, gen_random_uuid())) like 'ERR:NOT_FOUND%', 'unknown user');

  raise exception 'ALL_ADMIN_USERS_TESTS_PASSED';
end $$;
