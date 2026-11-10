-- Pruebas del horario de atención. Usan instantes FIJOS (no dependen de la hora en que se ejecuten).
-- 2026-11-09 es lunes; zona horaria de prueba America/Caracas (UTC-4).
-- Termina con el error intencional ALL_HOURS_TESTS_PASSED, que revierte todo.

create schema tests;
create function tests.assert(c boolean, label text) returns void language plpgsql as $$
begin if c is not true then raise exception 'FAILED: %', label; end if; end $$;
create function tests.try_as(uid uuid, q text, r text default 'authenticated') returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claims', case when uid is null then '' else json_build_object('sub', uid, 'role', r)::text end, true);
  execute format('set local role %I', r);
  begin execute q; reset role; perform set_config('request.jwt.claims', '', true); return 'ok';
  exception when others then reset role; perform set_config('request.jwt.claims', '', true); return sqlerrm; end;
end $$;
create function tests.val_as(uid uuid, q text, r text default 'authenticated') returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', case when uid is null then '' else json_build_object('sub', uid, 'role', r)::text end, true);
  execute format('set local role %I', r);
  begin execute q into v; reset role; perform set_config('request.jwt.claims', '', true); return v;
  exception when others then reset role; perform set_config('request.jwt.claims', '', true); return 'ERR:' || sqlerrm; end;
end $$;

do $$
declare
  ownA uuid := gen_random_uuid(); opA uuid := gen_random_uuid(); ownB uuid := gen_random_uuid(); anyone uuid := gen_random_uuid();
  tA uuid; tB uuid; st jsonb; cust uuid;
  week_mon_sat text := '[{"weekday":1,"is_open":true,"opens_at":"09:00","closes_at":"18:00"},{"weekday":2,"is_open":true,"opens_at":"09:00","closes_at":"18:00"},{"weekday":3,"is_open":true,"opens_at":"09:00","closes_at":"18:00"},{"weekday":4,"is_open":true,"opens_at":"09:00","closes_at":"18:00"},{"weekday":5,"is_open":true,"opens_at":"09:00","closes_at":"18:00"},{"weekday":6,"is_open":true,"opens_at":"09:00","closes_at":"18:00"},{"weekday":7,"is_open":false}]';
  week_night text := '[{"weekday":1,"is_open":true,"opens_at":"09:00","closes_at":"18:00"},{"weekday":2,"is_open":true,"opens_at":"09:00","closes_at":"18:00"},{"weekday":3,"is_open":true,"opens_at":"09:00","closes_at":"18:00"},{"weekday":4,"is_open":true,"opens_at":"09:00","closes_at":"18:00"},{"weekday":5,"is_open":true,"opens_at":"18:00","closes_at":"02:00"},{"weekday":6,"is_open":false},{"weekday":7,"is_open":false}]';
  week_all_days text := '[{"weekday":1,"is_open":true,"opens_at":"08:00","closes_at":"20:00"},{"weekday":2,"is_open":true,"opens_at":"08:00","closes_at":"20:00"},{"weekday":3,"is_open":true,"opens_at":"08:00","closes_at":"20:00"},{"weekday":4,"is_open":true,"opens_at":"08:00","closes_at":"20:00"},{"weekday":5,"is_open":true,"opens_at":"08:00","closes_at":"20:00"},{"weekday":6,"is_open":true,"opens_at":"08:00","closes_at":"20:00"},{"weekday":7,"is_open":true,"opens_at":"08:00","closes_at":"20:00"}]';
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email, now(), '{}'::jsonb, now(), now()
  from (values (ownA,'owna@t.test'),(opA,'opa@t.test'),(ownB,'ownb@t.test'),(anyone,'any@t.test')) as u(id, email);
  tA := tests.val_as(ownA, $q$select public.create_tenant('Restaurante Luna','restaurant')$q$)::uuid;
  tB := tests.val_as(ownB, $q$select public.create_tenant('Otro Comercio','store')$q$)::uuid;
  insert into public.tenant_members (tenant_id, user_id, role) values (tA, opA, 'operator');

  -- Sin horario configurado: abierto las 24 horas; el paso de la guía aparece pendiente.
  st := tests.val_as(ownA, format('select public.get_open_status(%L)::text', tA))::jsonb;
  perform tests.assert((st ->> 'is_open')::boolean and not (st ->> 'hours_enabled')::boolean, 'default is open 24h');
  perform tests.assert(((tests.val_as(ownA, format('select public.get_onboarding_status(%L)::text', tA)))::jsonb #>> '{steps,2,key}') = 'business_hours'
    and ((tests.val_as(ownA, format('select public.get_onboarding_status(%L)::text', tA)))::jsonb #>> '{steps,2,done}') = 'false', 'hours step pending');

  -- Permisos y validación
  perform tests.assert(tests.try_as(opA, format($q$select public.set_business_hours(%L,true,%L::jsonb)$q$, tA, week_mon_sat)) like '%Not found%', 'operator cannot set hours');
  perform tests.assert(tests.try_as(ownB, format($q$select public.set_business_hours(%L,true,%L::jsonb)$q$, tA, week_mon_sat)) like '%Not found%', 'other tenant cannot set hours');
  perform tests.assert(tests.try_as(null, format($q$select public.set_business_hours(%L,true,%L::jsonb)$q$, tA, week_mon_sat), 'anon') like '%permission denied%', 'anon cannot set hours');
  perform tests.assert(tests.try_as(ownA, format($q$select public.set_business_hours(%L,true,'[]'::jsonb)$q$, tA)) like '%HOURS_INVALID%', 'needs all 7 days');
  perform tests.assert(tests.try_as(ownA, format($q$select public.set_business_hours(%L,true,%L::jsonb)$q$, tA, replace(week_mon_sat, '"weekday":7', '"weekday":6'))) like '%HOURS_INVALID%', 'duplicate weekday rejected');
  perform tests.assert(tests.try_as(ownA, format($q$select public.set_business_hours(%L,true,%L::jsonb)$q$, tA, replace(week_mon_sat, '"opens_at":"09:00","closes_at":"18:00"},{"weekday":2', '"opens_at":"09:00","closes_at":"09:00"},{"weekday":2'))) like '%violates check constraint%', 'opens = closes rejected');
  perform tests.assert(tests.try_as(ownA, format($q$select public.set_business_hours(%L,true,%L::jsonb)$q$, tA, replace(week_mon_sat, '"09:00"', '"nine"'))) <> 'ok', 'bad time rejected');
  perform tests.assert(tests.try_as(ownA, format($q$select public.set_business_hours(%L,true,%L::jsonb)$q$, tA,
    '[{"weekday":1,"is_open":false},{"weekday":2,"is_open":false},{"weekday":3,"is_open":false},{"weekday":4,"is_open":false},{"weekday":5,"is_open":false},{"weekday":6,"is_open":false},{"weekday":7,"is_open":false}]')) like '%HOURS_INVALID%', 'cannot enable with every day closed');
  perform tests.assert(tests.try_as(ownA, format($q$update public.tenant_settings set timezone='Mars/Base' where tenant_id=%L$q$, tA)) like '%Invalid time zone%', 'invalid time zone rejected');
  perform tests.assert(tests.try_as(ownA, format($q$update public.tenant_settings set hours_enabled=true where tenant_id=%L$q$, tA)) like '%permission denied%', 'hours_enabled only via RPC');
  perform tests.assert(tests.try_as(ownA, format($q$update public.tenant_settings set timezone='America/Caracas' where tenant_id=%L$q$, tA)) = 'ok', 'owner sets time zone');

  -- Lunes a sábado 09:00–18:00, domingo cerrado
  perform tests.assert(tests.try_as(ownA, format($q$select public.set_business_hours(%L,true,%L::jsonb)$q$, tA, week_mon_sat)) = 'ok', 'owner saves Mon-Sat hours');
  perform tests.assert(tests.val_as(opA, format('select count(*) from public.tenant_business_hours where tenant_id=%L', tA))::int = 7, 'operator reads hours');
  perform tests.assert(tests.val_as(anyone, format('select count(*) from public.tenant_business_hours where tenant_id=%L', tA))::int = 0, 'outsider cannot read hours');
  perform tests.assert(tests.try_as(ownA, format($q$update public.tenant_business_hours set is_open=false where tenant_id=%L$q$, tA)) like '%permission denied%', 'no direct hour edits');
  perform tests.assert(((tests.val_as(ownA, format('select public.get_onboarding_status(%L)::text', tA)))::jsonb #>> '{steps,2,done}') = 'true', 'hours step done');
  perform tests.assert(tests.val_as(ownB, format('select public.get_open_status(%L)::text', tA)) like 'ERR:%Not found%', 'outsider cannot read status');

  st := tests.val_as(ownA, format($q$select public.get_open_status(%L,'2026-11-09 14:00:00-04')::text$q$, tA))::jsonb;
  perform tests.assert((st ->> 'is_open')::boolean and st ->> 'closes_at' = '18:00', 'Monday 14:00 open, closes 18:00');
  st := tests.val_as(ownA, format($q$select public.get_open_status(%L,'2026-11-09 20:00:00-04')::text$q$, tA))::jsonb;
  perform tests.assert(not (st ->> 'is_open')::boolean and st ->> 'next_open_local' = '2026-11-10T09:00' and st ->> 'next_opens_at' = '09:00'
    and st ->> 'next_closes_at' = '18:00' and (st ->> 'next_open_weekday')::int = 2, 'Monday 20:00 closed, opens Tuesday 09:00');
  perform tests.assert((st ->> 'next_open_at')::timestamptz = '2026-11-10 13:00:00+00', 'next opening is a correct instant');
  st := tests.val_as(ownA, format($q$select public.get_open_status(%L,'2026-11-09 08:59:00-04')::text$q$, tA))::jsonb;
  perform tests.assert(not (st ->> 'is_open')::boolean and st ->> 'next_open_local' = '2026-11-09T09:00', 'before opening: opens same day');
  st := tests.val_as(ownA, format($q$select public.get_open_status(%L,'2026-11-09 18:00:00-04')::text$q$, tA))::jsonb;
  perform tests.assert(not (st ->> 'is_open')::boolean, 'closing time is exclusive');
  st := tests.val_as(ownA, format($q$select public.get_open_status(%L,'2026-11-14 19:00:00-04')::text$q$, tA))::jsonb;
  perform tests.assert(not (st ->> 'is_open')::boolean and st ->> 'next_open_local' = '2026-11-16T09:00' and (st ->> 'next_open_weekday')::int = 1, 'Saturday evening: skips Sunday, opens Monday');
  st := tests.val_as(ownA, format($q$select public.get_open_status(%L,'2026-11-15 12:00:00-04')::text$q$, tA))::jsonb;
  perform tests.assert(not (st ->> 'is_open')::boolean and st ->> 'next_open_local' = '2026-11-16T09:00', 'Sunday closed all day');

  -- La zona horaria del comercio manda: el mismo instante UTC es distinto en Tokio y en Caracas.
  st := tests.val_as(ownA, format($q$select public.get_open_status(%L,'2026-11-09 08:30:00+00')::text$q$, tA))::jsonb;
  perform tests.assert(not (st ->> 'is_open')::boolean, 'Caracas 04:30 closed');
  update public.tenant_settings set timezone = 'Asia/Tokyo' where tenant_id = tA;
  st := tests.val_as(ownA, format($q$select public.get_open_status(%L,'2026-11-09 08:30:00+00')::text$q$, tA))::jsonb;
  perform tests.assert((st ->> 'is_open')::boolean, 'Tokyo 17:30 open for the same instant');
  update public.tenant_settings set timezone = 'America/Caracas' where tenant_id = tA;

  -- Turno nocturno: viernes 18:00–02:00
  perform tests.assert(tests.try_as(ownA, format($q$select public.set_business_hours(%L,true,%L::jsonb)$q$, tA, week_night)) = 'ok', 'owner saves overnight hours');
  st := tests.val_as(ownA, format($q$select public.get_open_status(%L,'2026-11-13 19:00:00-04')::text$q$, tA))::jsonb;
  perform tests.assert((st ->> 'is_open')::boolean and st ->> 'closes_at' = '02:00', 'Friday 19:00 open until 02:00');
  st := tests.val_as(ownA, format($q$select public.get_open_status(%L,'2026-11-14 01:00:00-04')::text$q$, tA))::jsonb;
  perform tests.assert((st ->> 'is_open')::boolean and st ->> 'closes_at' = '02:00', 'Saturday 01:00 still open (Friday shift)');
  st := tests.val_as(ownA, format($q$select public.get_open_status(%L,'2026-11-14 02:00:00-04')::text$q$, tA))::jsonb;
  perform tests.assert(not (st ->> 'is_open')::boolean and st ->> 'next_open_local' = '2026-11-16T09:00', 'Saturday 02:00 closed, opens Monday');

  -- Lunes a domingo
  perform tests.assert(tests.try_as(ownA, format($q$select public.set_business_hours(%L,true,%L::jsonb)$q$, tA, week_all_days)) = 'ok', 'owner saves Mon-Sun hours');
  st := tests.val_as(ownA, format($q$select public.get_open_status(%L,'2026-11-15 12:00:00-04')::text$q$, tA))::jsonb;
  perform tests.assert((st ->> 'is_open')::boolean, 'Sunday open when working Mon-Sun');

  -- Sin pedidos con el comercio cerrado
  insert into public.customers (tenant_id, phone_e164) values (tA, '+584141112222') returning id into cust;
  delete from public.tenant_business_hours where tenant_id = tA;
  insert into public.tenant_business_hours (tenant_id, weekday, is_open) select tA, d, false from generate_series(1, 7) d;
  update public.tenant_settings set hours_enabled = true where tenant_id = tA;
  begin
    insert into public.orders (tenant_id, order_number, customer_id, fulfillment, customer_phone_snapshot, currency, subtotal, total, payment_method_type)
    values (tA, 1, cust, 'pickup', '+584141112222', 'USD', 1, 1, 'cash');
    raise exception 'FAILED: order accepted while closed';
  exception when others then if sqlerrm not like '%OUTSIDE_HOURS%' then raise; end if; end;
  update public.tenant_settings set hours_enabled = false where tenant_id = tA;
  insert into public.orders (tenant_id, order_number, customer_id, fulfillment, customer_phone_snapshot, currency, subtotal, total, payment_method_type)
  values (tA, 1, cust, 'pickup', '+584141112222', 'USD', 1, 1, 'cash');
  perform tests.assert((select count(*) from public.orders where tenant_id = tA) = 1, 'orders accepted when open 24h');

  -- Mensaje fuera de horario con apertura y cierre
  perform tests.assert((select body from public.message_template_defaults where key = 'out_of_hours') like '%{schedule}%{next_open}%', 'default out-of-hours message includes schedule and next opening');
  perform tests.assert(tests.try_as(ownA, format($q$insert into public.tenant_messages (tenant_id,key,body) values (%L,'out_of_hours','Cerrado. Abrimos {next_open} a las {opening_time} y cerramos {closing_time}. {schedule}')$q$, tA)) = 'ok', 'owner customizes out-of-hours message');
  perform tests.assert(tests.try_as(ownA, format($q$insert into public.tenant_messages (tenant_id,key,body) values (%L,'business_info','Horario {foo}')$q$, tA)) like '%not allowed%', 'unknown placeholder still rejected');

  raise exception 'ALL_HOURS_TESTS_PASSED';
end $$;
