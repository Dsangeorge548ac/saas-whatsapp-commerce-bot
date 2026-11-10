-- Pruebas de la ubicación GPS para el delivery. Termina con el error intencional
-- ALL_LOCATION_TESTS_PASSED, que revierte todo.

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
  ownA uuid := gen_random_uuid(); opA uuid := gen_random_uuid(); padm uuid := gen_random_uuid();
  tA uuid; pm uuid; prod uuid; cust uuid; sess uuid; cart uuid; o1 uuid; o1b uuid; o2 uuid; o3 uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email, now(), '{}'::jsonb, now(), now()
  from (values (ownA,'owna@t.test'),(opA,'opa@t.test'),(padm,'padm@t.test')) as u(id, email);
  insert into public.platform_roles (user_id, role) values (padm, 'platform_admin');
  tA := tests.val_as(ownA, $q$select public.create_tenant('Pizzeria Sol','restaurant')$q$)::uuid;
  insert into public.tenant_members (tenant_id, user_id, role) values (tA, opA, 'operator');
  insert into public.tenant_subscriptions (tenant_id, plan_id, status) values (tA, 'pro', 'active');
  update public.tenant_settings set bot_enabled = true where tenant_id = tA;
  insert into public.tenant_payment_methods (tenant_id, type, label) values (tA, 'zelle', 'Zelle') returning id into pm;
  insert into public.products (tenant_id, name, price) values (tA, 'Pizza', 10) returning id into prod;
  insert into public.customers (tenant_id, phone_e164, profile_name) values (tA, '+584141234567', 'Cliente') returning id into cust;
  insert into public.conversation_sessions (tenant_id, customer_id) values (tA, cust) returning id into sess;
  insert into public.carts (tenant_id, session_id) values (tA, sess) returning id into cart;
  insert into public.cart_items (tenant_id, cart_id, product_id, quantity, unit_price_snapshot) values (tA, cart, prod, 2, 10);

  -- Por defecto el comercio exige ubicación para el delivery.
  perform tests.assert((select require_delivery_location from public.tenant_settings where tenant_id = tA), 'location required by default');
  begin perform public.create_order_from_cart(cart, 'delivery', 'Calle 1', null, pm, 'wamid.L1'); raise exception 'FAILED: delivery without location accepted';
  exception when others then if sqlerrm not like '%LOCATION_REQUIRED%' then raise; end if; end;
  begin perform public.create_order_from_cart(cart, 'delivery', 'Calle 1', null, pm, 'wamid.L1', 95, 10); raise exception 'FAILED: latitude 95 accepted';
  exception when others then if sqlerrm not like '%LOCATION_INVALID%' then raise; end if; end;
  begin perform public.create_order_from_cart(cart, 'delivery', 'Calle 1', null, pm, 'wamid.L1', 10.5, 200); raise exception 'FAILED: longitude 200 accepted';
  exception when others then if sqlerrm not like '%LOCATION_INVALID%' then raise; end if; end;
  begin perform public.create_order_from_cart(cart, 'delivery', 'Calle 1', null, pm, 'wamid.L1', 10.5, null); raise exception 'FAILED: half a location accepted';
  exception when others then if sqlerrm not like '%LOCATION_INVALID%' then raise; end if; end;

  o1 := public.create_order_from_cart(cart, 'delivery', 'Casa azul, frente a la plaza', null, pm, 'wamid.L1', 10.491016, -66.902061);
  o1b := public.create_order_from_cart(cart, 'delivery', 'Casa azul, frente a la plaza', null, pm, 'wamid.L1', 10.491016, -66.902061);
  perform tests.assert(o1 = o1b, 'delivery order with location is idempotent');
  perform tests.assert((select delivery_lat from public.orders where id = o1) = 10.491016 and (select delivery_lng from public.orders where id = o1) = -66.902061, 'GPS frozen in the order');

  -- Inmutable como el resto del pedido
  begin update public.orders set delivery_lat = 0, delivery_lng = 0 where id = o1; raise exception 'FAILED: order location mutable';
  exception when sqlstate '42501' then null; end;

  -- Quién la ve: operador con suscripción y dueño; no el administrador del SaaS ni anon
  perform tests.assert(tests.val_as(opA, format('select delivery_lat::text from public.orders where id=%L', o1)) = '10.491016', 'operator sees the location');
  perform tests.assert(tests.val_as(ownA, format('select delivery_lng::text from public.orders where id=%L', o1)) = '-66.902061', 'owner sees the location');
  perform tests.assert(tests.val_as(padm, format('select count(*) from public.orders where id=%L', o1))::int = 0, 'platform admin cannot read order locations');
  perform tests.assert(tests.val_as(null, 'select count(*) from public.orders', 'anon') like 'ERR:%permission denied%', 'anon cannot read orders');

  -- Si el comercio no exige GPS, basta la dirección escrita; sin ninguna de las dos se rechaza
  perform tests.assert(tests.try_as(opA, format($q$update public.tenant_settings set require_delivery_location=false where tenant_id=%L$q$, tA)) like '%row-level security%' or
    tests.val_as(opA, format($q$with u as (update public.tenant_settings set require_delivery_location=false where tenant_id=%L returning 1) select count(*) from u$q$, tA))::int = 0, 'operator cannot change the setting');
  perform tests.assert(tests.try_as(ownA, format($q$update public.tenant_settings set require_delivery_location=false where tenant_id=%L$q$, tA)) = 'ok', 'owner can make GPS optional');
  insert into public.customers (tenant_id, phone_e164) values (tA, '+584147654321') returning id into cust;
  insert into public.conversation_sessions (tenant_id, customer_id) values (tA, cust) returning id into sess;
  insert into public.carts (tenant_id, session_id) values (tA, sess) returning id into cart;
  insert into public.cart_items (tenant_id, cart_id, product_id, quantity, unit_price_snapshot) values (tA, cart, prod, 1, 10);
  begin perform public.create_order_from_cart(cart, 'delivery', '   ', null, pm, 'wamid.L2'); raise exception 'FAILED: delivery with no address nor GPS accepted';
  exception when others then if sqlerrm not like '%ADDRESS_REQUIRED%' then raise; end if; end;
  o2 := public.create_order_from_cart(cart, 'delivery', 'Av. Principal 123', null, pm, 'wamid.L2');
  perform tests.assert((select delivery_lat from public.orders where id = o2) is null and (select delivery_address_text from public.orders where id = o2) = 'Av. Principal 123', 'address-only delivery allowed when GPS is optional');

  -- Retiro en local: las coordenadas se ignoran
  update public.tenant_settings set require_delivery_location = true where tenant_id = tA;
  insert into public.customers (tenant_id, phone_e164) values (tA, '+584149998877') returning id into cust;
  insert into public.conversation_sessions (tenant_id, customer_id) values (tA, cust) returning id into sess;
  insert into public.carts (tenant_id, session_id) values (tA, sess) returning id into cart;
  insert into public.cart_items (tenant_id, cart_id, product_id, quantity, unit_price_snapshot) values (tA, cart, prod, 1, 10);
  o3 := public.create_order_from_cart(cart, 'pickup', null, null, pm, 'wamid.L3', 10.5, -66.9);
  perform tests.assert((select delivery_lat from public.orders where id = o3) is null, 'pickup order stores no location');

  -- FSM: delivery → awaiting_location → awaiting_address → awaiting_notes
  update public.conversation_sessions set state = 'browsing_menu' where id = sess;
  update public.conversation_sessions set state = 'building_cart' where id = sess;
  update public.conversation_sessions set state = 'awaiting_cart_confirmation' where id = sess;
  update public.conversation_sessions set state = 'awaiting_location' where id = sess;
  update public.conversation_sessions set state = 'awaiting_address' where id = sess;
  update public.conversation_sessions set state = 'awaiting_notes' where id = sess;
  begin update public.conversation_sessions set state = 'awaiting_location' where id = sess; update public.conversation_sessions set state = 'awaiting_proof' where id = sess;
    raise exception 'FAILED: awaiting_location jumped to awaiting_proof';
  exception when others then if sqlerrm not like '%Invalid session transition%' then raise; end if; end;

  -- Mensajes estándar del flujo de ubicación
  perform tests.assert((select count(*) from public.message_template_defaults where key in ('ask_location','location_received','location_invalid')) = 3, 'location messages exist');
  perform tests.assert(tests.try_as(ownA, format($q$insert into public.tenant_messages (tenant_id,key,body) values (%L,'ask_location','Comparte tu ubicación para llevarte el pedido 📍')$q$, tA)) = 'ok', 'owner customizes the location message');

  -- Coordenadas de direcciones del cliente: las dos o ninguna
  begin insert into public.customer_addresses (tenant_id, customer_id, address_text, lat) values (tA, cust, 'Casa de prueba', 10.5); raise exception 'FAILED: half a location saved';
  exception when check_violation then null; end;

  raise exception 'ALL_LOCATION_TESTS_PASSED';
end $$;
