-- Pruebas de seguridad (RLS, roles, suscripción, pedidos inmutables, idempotencia).
-- Se ejecuta de una sola vez y TERMINA con el error intencional ALL_SECURITY_TESTS_PASSED, que
-- revierte todo (no deja datos). Cualquier otro error indica una comprobación fallida.
-- Simula usuarios con el rol `authenticated`/`anon` y claims JWT; las acciones "del servidor"
-- (webhook, Stripe) se hacen como postgres, que equivale a la service role.

create schema tests;
create function tests.assert(c boolean, label text) returns void language plpgsql as $$
begin if c is not true then raise exception 'FAILED: %', label; end if; end $$;

-- Ejecuta una sentencia como un usuario; devuelve 'ok' o el mensaje de error.
create function tests.try_as(uid uuid, q text, r text default 'authenticated') returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claims', case when uid is null then '' else json_build_object('sub', uid, 'role', r)::text end, true);
  execute format('set local role %I', r);
  begin execute q; reset role; perform set_config('request.jwt.claims', '', true); return 'ok';
  exception when others then reset role; perform set_config('request.jwt.claims', '', true); return sqlerrm; end;
end $$;

-- Devuelve el primer valor de una consulta como texto (o 'ERR:' + mensaje).
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
  dev uuid := gen_random_uuid();   padm uuid := gen_random_uuid();
  ownA uuid := gen_random_uuid();  opA uuid := gen_random_uuid();
  ownB uuid := gen_random_uuid();  stranger uuid := gen_random_uuid(); unver uuid := gen_random_uuid();
  tA uuid; tB uuid; token text; r text; pm uuid; prod uuid; cust uuid; sess uuid; cart uuid;
  o1 uuid; o1b uuid; o2 uuid; cust2 uuid; sess2 uuid; cart2 uuid; proof uuid; catA uuid; i int; ok boolean;
  cust3 uuid; sess3 uuid; o3 uuid; pub uuid; slugA text; tW uuid; tokw text; res jsonb;
begin
  -- ───── Preparación: usuarios (el trigger crea sus perfiles) ─────
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email,
         case when u.email like 'unver%' then null else now() end, '{"role":"developer","first_name":"X"}'::jsonb, now(), now()
  from (values (dev,'dev@t.test'),(padm,'padm@t.test'),(ownA,'owna@t.test'),(opA,'opa@t.test'),
               (ownB,'ownb@t.test'),(stranger,'stranger@t.test'),(unver,'unver@t.test')) as u(id, email);
  perform tests.assert((select count(*) from public.profiles where id in (dev,padm,ownA,opA,ownB,stranger,unver)) = 7, 'profiles created by trigger');
  -- El rol NO sale de la metadata del registro.
  perform tests.assert(not exists (select 1 from public.platform_roles where user_id = ownA), 'metadata role ignored');
  insert into public.platform_roles (user_id, role) values (dev, 'developer'), (padm, 'platform_admin');

  -- ───── Alta de comercios ─────
  perform tests.assert(tests.val_as(unver, $q$select public.create_tenant('Sin Verificar','store')$q$) like '%Email not verified%', 'unverified email cannot create tenant');
  tA := tests.val_as(ownA, $q$select public.create_tenant('Panaderia A','store')$q$)::uuid;
  tB := tests.val_as(ownB, $q$select public.create_tenant('Restaurante B','restaurant')$q$)::uuid;
  perform tests.assert(tA is not null and tB is not null, 'tenants created');

  -- ───── Aislamiento entre comercios ─────
  perform tests.assert(tests.val_as(ownA, 'select count(*) from public.tenants')::int = 1, 'owner A sees only own tenant');
  perform tests.assert(tests.val_as(ownB, format('select count(*) from public.tenant_settings where tenant_id=%L', tA))::int = 0, 'B cannot read A settings');
  perform tests.assert(tests.val_as(stranger, 'select count(*) from public.tenants')::int = 0, 'stranger sees nothing');
  perform tests.assert(tests.try_as(ownA, format($q$insert into public.tenant_payment_methods (tenant_id,type,label) values (%L,'zelle','Zelle A')$q$, tA)) = 'ok', 'owner A adds payment method');
  perform tests.assert(tests.try_as(ownB, format($q$insert into public.tenant_payment_methods (tenant_id,type,label) values (%L,'zelle','Hack')$q$, tA)) like '%row-level security%', 'B cannot insert into A');
  perform tests.assert(tests.val_as(ownB, format($q$with u as (update public.tenants set name='Hacked' where id=%L returning 1) select count(*) from u$q$, tA))::int = 0, 'B cannot rename A');
  perform tests.assert(tests.val_as(ownB, format('select count(*) from public.tenant_payment_methods where tenant_id=%L', tA))::int = 0, 'B cannot read A payment methods');

  -- ───── Escalada de privilegios ─────
  perform tests.assert(tests.try_as(ownA, format($q$insert into public.tenant_members (tenant_id,user_id,role) values (%L,%L,'owner')$q$, tB, ownA)) like '%permission denied%', 'cannot self-add as owner of B');
  perform tests.assert(tests.try_as(ownA, format($q$insert into public.platform_roles (user_id,role) values (%L,'developer')$q$, ownA)) like '%permission denied%', 'cannot self-grant developer');
  perform tests.assert(tests.try_as(padm, format($q$insert into public.platform_roles (user_id,role) values (%L,'developer')$q$, padm)) like '%permission denied%', 'platform_admin cannot grant roles');
  perform tests.assert(tests.try_as(ownA, format($q$update public.profiles set email='x@x.com' where id=%L$q$, ownA)) like '%permission denied%', 'cannot edit own email');
  perform tests.assert(tests.try_as(ownA, 'select public.log_audit(null,''X'',''x'')') like '%permission denied%', 'users cannot forge audit');
  perform tests.assert(tests.try_as(ownA, $q$select public.take_attempt('t','k',5,60)$q$) like '%permission denied%', 'users cannot call take_attempt');
  perform tests.assert(tests.try_as(null, 'select count(*) from public.tenants', 'anon') like '%permission denied%', 'anon has no access');
  perform tests.assert(tests.val_as(ownA, 'select count(*) from public.webhook_events') like 'ERR:%permission denied%', 'webhook_events hidden');
  perform tests.assert(tests.val_as(ownA, 'select count(*) from public.stripe_events') like 'ERR:%permission denied%', 'stripe_events hidden');

  -- ───── Suscripción: sin pago no se invita ─────
  perform tests.assert(tests.try_as(ownA, format($q$select public.invite_operator(%L,'opa@t.test')$q$, tA)) like '%SUBSCRIPTION_REQUIRED%', 'invite requires subscription');
  insert into public.tenant_subscriptions (tenant_id, plan_id, status) values (tA, 'starter', 'active');
  token := tests.val_as(ownA, format($q$select public.invite_operator(%L,'opa@t.test')$q$, tA));
  perform tests.assert(token is not null and token not like 'ERR:%', 'invite after payment: ' || coalesce(token,''));
  perform tests.assert(tests.val_as(ownA, 'select count(token_hash) from public.tenant_invitations') like 'ERR:%permission denied%', 'token_hash not readable');
  perform tests.assert(tests.try_as(stranger, format($q$select public.accept_invitation(%L)$q$, token)) like '%Invalid or expired%', 'wrong user cannot accept');
  perform tests.assert(tests.try_as(opA, format($q$select public.accept_invitation(%L)$q$, token)) = 'ok', 'right user accepts');
  perform tests.assert(tests.try_as(opA, format($q$select public.accept_invitation(%L)$q$, token)) like '%Invalid or expired%', 'token single use');
  perform tests.assert(tests.try_as(ownA, format($q$select public.invite_operator(%L,'third@t.test')$q$, tA)) like '%USER_LIMIT_REACHED%', 'plan user limit enforced');
  perform tests.assert(tests.try_as(opA, format($q$select public.invite_operator(%L,'x@t.test')$q$, tA)) like '%Not found%', 'operator cannot invite');

  -- ───── Roles dentro del comercio ─────
  perform tests.assert(tests.val_as(opA, format('select count(*) from public.tenant_payment_methods where tenant_id=%L', tA))::int = 1, 'operator reads config');
  perform tests.assert(tests.try_as(opA, format($q$insert into public.products (tenant_id,name,price) values (%L,'Hack',1)$q$, tA)) like '%row-level security%', 'operator cannot edit catalog');
  perform tests.assert(tests.val_as(opA, format('select count(*) from public.tenant_whatsapp_accounts where tenant_id=%L', tA))::int = 0, 'operator cannot see WhatsApp credentials');
  perform tests.assert(tests.try_as(opA, format($q$select public.remove_operator(%L,%L)$q$, tA, opA)) like '%Not found%', 'operator cannot manage team');

  -- ───── Catálogo, FK compuesta y validación de mensajes ─────
  perform tests.assert(tests.try_as(ownA, format($q$insert into public.categories (tenant_id,name) values (%L,'Panes')$q$, tA)) = 'ok', 'owner adds category');
  select id into catA from public.categories where tenant_id = tA;
  perform tests.assert(tests.try_as(ownA, format($q$insert into public.products (tenant_id,name,price,category_id) values (%L,'Pan',2.50,%L)$q$, tA, catA)) = 'ok', 'owner adds product');
  begin insert into public.products (tenant_id, name, price, category_id) values (tB, 'Cross', 1, catA); raise exception 'FAILED: cross-tenant category allowed';
  exception when foreign_key_violation then null; end;
  perform tests.assert(tests.try_as(ownA, format($q$insert into public.tenant_messages (tenant_id,key,body) values (%L,'welcome','Hola {customer_name} {foo}')$q$, tA)) like '%not allowed%', 'unknown placeholder rejected');
  perform tests.assert(tests.try_as(ownA, format($q$insert into public.tenant_messages (tenant_id,key,body) values (%L,'payment_instructions','Paga ya')$q$, tA)) like '%must include%', 'required placeholders enforced');
  perform tests.assert(tests.try_as(ownA, format($q$insert into public.tenant_messages (tenant_id,key,body) values (%L,'welcome','Hola {customer_name}, bienvenido a {business_name}')$q$, tA)) = 'ok', 'valid message saved');
  perform tests.assert(tests.try_as(ownA, format('select public.create_default_menu(%L)', tA)) = 'ok', 'default menu created');

  -- ───── Activar el bot ─────
  perform tests.assert(tests.try_as(ownA, format('select public.activate_bot(%L)', tA)) like '%WHATSAPP_NOT_CONNECTED%', 'activation needs WhatsApp');
  insert into public.tenant_whatsapp_accounts (tenant_id, waba_id, phone_number_id, display_phone, status) values (tA, 'w1', 'pn1', '+584140000000', 'connected');
  perform tests.assert(tests.try_as(ownA, format('select public.activate_bot(%L)', tA)) = 'ok', 'owner activates bot');
  perform tests.assert(tests.try_as(opA, format('select public.activate_bot(%L)', tA)) like '%Not found%', 'operator cannot activate bot');
  perform tests.assert((tests.val_as(ownA, format('select public.get_onboarding_status(%L)::text', tA)))::jsonb -> 'bot_enabled' = 'true'::jsonb, 'onboarding status computed');

  -- ───── Pedido: creación, idempotencia, snapshots ─────
  select id into pm from public.tenant_payment_methods where tenant_id = tA;
  select id into prod from public.products where tenant_id = tA;
  insert into public.customers (tenant_id, phone_e164, profile_name) values (tA, '+584141234567', 'Cliente Uno') returning id into cust;
  insert into public.conversation_sessions (tenant_id, customer_id) values (tA, cust) returning id into sess;
  insert into public.carts (tenant_id, session_id) values (tA, sess) returning id into cart;
  insert into public.cart_items (tenant_id, cart_id, product_id, quantity, unit_price_snapshot) values (tA, cart, prod, 4, 2.50);
  o1 := public.create_order_from_cart(cart, 'delivery', 'Calle 1, casa 2', null, pm, 'wamid.ORDER1', 10.491016, -66.902061);
  o1b := public.create_order_from_cart(cart, 'delivery', 'Calle 1, casa 2', null, pm, 'wamid.ORDER1', 10.491016, -66.902061);
  perform tests.assert(o1 = o1b, 'order creation is idempotent per wamid');
  perform tests.assert((select total from public.orders where id = o1) = 10.00, 'order total re-priced');
  perform tests.assert((select status from public.orders where id = o1) = 'awaiting_payment', 'new order awaits payment');
  perform tests.assert((select count(*) from public.order_status_history where order_id = o1) = 1, 'initial history row');
  perform tests.assert((select count(*) from public.notifications where tenant_id = tA and kind = 'order_new') = 0, 'no alert before payment');
  perform tests.assert(tests.try_as(opA, format($q$select public.advance_order(%L,'approved')$q$, o1)) like '%Invalid order transition%', 'cannot approve unpaid order');
  insert into public.payment_proofs (tenant_id, order_id, reference_number) values (tA, o1, 'REF-O1');
  perform tests.assert((select status from public.orders where id = o1) = 'pending', 'proof moves order to pending');
  perform tests.assert((select count(*) from public.notifications where tenant_id = tA and kind = 'order_new') = 2, 'members notified after payment');
  update public.products set price = 99 where id = prod;
  perform tests.assert((select unit_price from public.order_items where order_id = o1) = 2.50, 'price snapshot survives catalog change');

  -- ───── Estados: secuencia obligatoria, historial, inmutabilidad ─────
  perform tests.assert(tests.try_as(ownB, format($q$select public.advance_order(%L,'approved')$q$, o1)) like '%Not found%', 'other tenant cannot advance order');
  perform tests.assert(tests.try_as(opA, format($q$update public.orders set status='approved' where id=%L$q$, o1)) like '%permission denied%', 'no direct status update');
  perform tests.assert(tests.try_as(opA, format($q$select public.advance_order(%L,'delivered')$q$, o1)) like '%Invalid order transition%', 'cannot skip states');
  perform tests.assert(tests.try_as(opA, format($q$select public.advance_order(%L,'cancelled')$q$, o1)) like '%reason is required%', 'cancel needs reason');
  perform tests.assert(tests.try_as(opA, format($q$select public.advance_order(%L,'approved')$q$, o1)) = 'ok', 'operator approves');
  perform tests.assert(tests.try_as(opA, format($q$select public.advance_order(%L,'on_the_way')$q$, o1)) = 'ok', 'operator sends on the way');
  perform public.advance_order_system(o1, 'delivered', 'customer', 'Customer confirmed');
  perform tests.assert((select count(*) from public.order_status_history where order_id = o1) = 5, 'every change logged');
  perform tests.assert((select actor_type from public.order_status_history where order_id = o1 and to_status = 'delivered') = 'customer', 'customer actor recorded');
  begin update public.orders set total = 1, subtotal = 1 where id = o1; raise exception 'FAILED: order total mutable';
  exception when sqlstate '42501' then null; end;
  begin delete from public.order_status_history where order_id = o1; raise exception 'FAILED: history deletable';
  exception when sqlstate '42501' then null; end;
  begin update public.order_items set quantity = 9 where order_id = o1; raise exception 'FAILED: order items mutable';
  exception when sqlstate '42501' then null; end;
  begin update public.audit_logs set action = 'x'; raise exception 'FAILED: audit mutable';
  exception when sqlstate '42501' then null; end;

  -- ───── Comprobantes ─────
  insert into public.customers (tenant_id, phone_e164) values (tA, '+584147654321') returning id into cust2;
  insert into public.conversation_sessions (tenant_id, customer_id) values (tA, cust2) returning id into sess2;
  insert into public.carts (tenant_id, session_id) values (tA, sess2) returning id into cart2;
  update public.products set price = 2.50 where id = prod;
  insert into public.cart_items (tenant_id, cart_id, product_id, quantity, unit_price_snapshot) values (tA, cart2, prod, 1, 2.50);
  o2 := public.create_order_from_cart(cart2, 'pickup', null, 'sin cebolla', pm, 'wamid.ORDER2');
  insert into public.payment_proofs (tenant_id, order_id, reference_number) values (tA, o2, 'REF123') returning id into proof;
  perform tests.assert(tests.try_as(ownB, format($q$select public.review_proof(%L,'accept')$q$, proof)) like '%Not found%', 'other tenant cannot review proof');
  perform tests.assert(tests.try_as(opA, format($q$select public.review_proof(%L,'reject')$q$, proof)) like '%reason is required%', 'reject needs reason');
  perform tests.assert(tests.try_as(opA, format($q$select public.review_proof(%L,'accept')$q$, proof)) = 'ok', 'operator accepts proof');
  perform tests.assert((select status from public.orders where id = o2) = 'approved', 'accepting proof approves order');
  perform tests.assert(tests.try_as(opA, format($q$select public.review_proof(%L,'accept')$q$, proof)) like '%already reviewed%', 'proof reviewed once');

  -- ───── Publicaciones, tienda pública y pedido web ─────
  select slug::text into slugA from public.tenants where id = tA;
  perform tests.assert(tests.try_as(opA, format($q$insert into public.catalog_publications (tenant_id,title) values (%L,'Hack')$q$, tA)) like '%row-level security%', 'operator cannot create publications');
  perform tests.assert(tests.try_as(ownA, format($q$insert into public.catalog_publications (tenant_id,title) values (%L,'Promos')$q$, tA)) = 'ok', 'owner creates publication');
  select id into pub from public.catalog_publications where tenant_id = tA;
  perform tests.assert(tests.try_as(ownA, format($q$update public.catalog_publications set status='published' where id=%L$q$, pub)) like '%at least one product%', 'cannot publish empty publication');
  perform tests.assert(tests.try_as(ownB, format($q$insert into public.catalog_publication_items (publication_id,product_id,tenant_id) values (%L,%L,%L)$q$, pub, prod, tB)) <> 'ok', 'B cannot add items to A publication');
  perform tests.assert(tests.try_as(ownA, format($q$insert into public.catalog_publication_items (publication_id,product_id,tenant_id) values (%L,%L,%L)$q$, pub, prod, tA)) = 'ok', 'owner adds item');
  perform tests.assert((tests.val_as(null, format($q$select public.get_public_storefront(%L)::text$q$, slugA), 'anon')::jsonb) -> 'publications' = '[]'::jsonb, 'draft publication is not public');
  perform tests.assert(tests.try_as(ownA, format($q$update public.catalog_publications set status='published' where id=%L$q$, pub)) = 'ok', 'owner publishes');
  perform tests.assert(jsonb_array_length((tests.val_as(null, format($q$select public.get_public_storefront(%L)::text$q$, slugA), 'anon')::jsonb) -> 'publications') = 1, 'published publication is public');
  res := tests.val_as(null, format($q$select public.get_public_publication(%L,%L)::text$q$, slugA, pub), 'anon')::jsonb;
  perform tests.assert(jsonb_array_length(res -> 'items') = 1 and (res #>> '{items,0,price}')::numeric = 2.50, 'public cards expose name and price');
  perform tests.assert(res::text not like '%tenant_id%', 'public payload has no internal ids');
  perform tests.assert(tests.val_as(null, 'select count(*) from public.products', 'anon') like 'ERR:%permission denied%', 'anon cannot read products');
  perform tests.assert(tests.val_as(null, format($q$select public.get_public_publication('no-such-shop',%L)::text$q$, pub), 'anon') is null, 'unknown shop returns nothing');
  perform tests.assert(tests.try_as(null, $q$select public.submit_web_order('x','[]'::jsonb)$q$, 'anon') like '%permission denied%', 'anon cannot submit orders directly');
  perform tests.assert(tests.try_as(ownA, format($q$select public.create_web_order_link(%L,%L)$q$, sess, pub)) like '%permission denied%', 'users cannot mint order links');
  begin update public.tenants set slug = 'otro-nombre' where id = tA; raise exception 'FAILED: slug changed after publishing';
  exception when others then if sqlerrm not like '%cannot change after publishing%' then raise; end if; end;
  tW := tests.val_as(stranger, $q$select public.create_tenant('WWW','other')$q$)::uuid;
  perform tests.assert((select slug::text from public.tenants where id = tW) like 'www-%', 'reserved subdomain gets a suffix');

  insert into public.customers (tenant_id, phone_e164, profile_name) values (tA, '+584149998877', 'Cliente Web') returning id into cust3;
  insert into public.conversation_sessions (tenant_id, customer_id) values (tA, cust3) returning id into sess3;
  tokw := public.create_web_order_link(sess3, pub);
  begin perform public.submit_web_order(tokw, '[{"product_id":"00000000-0000-0000-0000-000000000000","quantity":1}]'::jsonb); raise exception 'FAILED: foreign product accepted';
  exception when others then if sqlerrm not like '%PRODUCT_UNAVAILABLE%' then raise; end if; end;
  begin perform public.submit_web_order(tokw, jsonb_build_array(jsonb_build_object('product_id', prod, 'quantity', 0))); raise exception 'FAILED: zero quantity accepted';
  exception when others then if sqlerrm not like '%ITEMS_INVALID%' then raise; end if; end;
  res := public.submit_web_order(tokw, jsonb_build_array(jsonb_build_object('product_id', prod, 'quantity', 3), jsonb_build_object('product_id', prod, 'quantity', 2)));
  perform tests.assert((res ->> 'subtotal')::numeric = 12.50, 'web order merged and re-priced on the server');
  perform tests.assert((select state from public.conversation_sessions where id = sess3) = 'awaiting_cart_confirmation', 'web order leaves the chat awaiting confirmation');
  begin perform public.submit_web_order(tokw, jsonb_build_array(jsonb_build_object('product_id', prod, 'quantity', 1))); raise exception 'FAILED: link reused';
  exception when others then if sqlerrm not like '%LINK_INVALID%' then raise; end if; end;
  tokw := public.create_web_order_link(sess3, pub);
  update public.web_order_links set expires_at = now() - interval '1 minute' where session_id = sess3 and submitted_at is null;
  begin perform public.submit_web_order(tokw, jsonb_build_array(jsonb_build_object('product_id', prod, 'quantity', 1))); raise exception 'FAILED: expired link accepted';
  exception when others then if sqlerrm not like '%LINK_INVALID%' then raise; end if; end;

  o3 := public.create_order_from_cart((res ->> 'cart_id')::uuid, 'pickup', null, null, pm, 'wamid.ORDER3');
  perform tests.assert((select status from public.orders where id = o3) = 'awaiting_payment' and (select total from public.orders where id = o3) = 12.50, 'web order becomes an unpaid order');
  alter table public.orders disable trigger orders_guard;
  update public.orders set placed_at = now() - interval '30 hours' where id = o3;
  alter table public.orders enable trigger orders_guard;
  perform tests.assert(tests.try_as(ownA, 'select public.expire_unpaid_orders(1)') like '%permission denied%', 'users cannot expire orders');
  perform tests.assert(public.expire_unpaid_orders(24) = 1, 'unpaid orders expire');
  perform tests.assert((select status from public.orders where id = o3) = 'cancelled'
    and (select reason from public.order_status_history where order_id = o3 and to_status = 'cancelled') = 'Payment timeout'
    and (select actor_type from public.order_status_history where order_id = o3 and to_status = 'cancelled') = 'system', 'expired order cancelled by system with reason');
  begin insert into public.payment_proofs (tenant_id, order_id, reference_number) values (tA, o3, 'LATE'); raise exception 'FAILED: proof on cancelled order';
  exception when others then if sqlerrm not like '%not awaiting payment%' then raise; end if; end;

  -- ───── Idempotencia de mensajes y FSM ─────
  insert into public.messages (tenant_id, customer_id, wamid, direction, sender_type) values (tA, cust, 'wamid.M1', 'inbound', 'customer');
  begin insert into public.messages (tenant_id, customer_id, wamid, direction, sender_type) values (tA, cust, 'wamid.M1', 'inbound', 'customer');
    raise exception 'FAILED: duplicate wamid accepted'; exception when unique_violation then null; end;
  begin update public.conversation_sessions set state = 'awaiting_proof' where id = sess2; raise exception 'FAILED: illegal FSM jump';
  exception when others then if sqlerrm not like '%Invalid session transition%' then raise; end if; end;
  update public.conversation_sessions set mode = 'human', handoff_requested_at = now(), state = 'human_handoff' where id = sess2;
  perform tests.assert(tests.try_as(opA, format('select public.claim_session(%L)', sess2)) = 'ok', 'operator claims session');
  perform tests.assert(tests.try_as(ownA, format('select public.claim_session(%L)', sess2)) like '%ALREADY_CLAIMED%', 'claim is atomic');

  -- ───── Plataforma: auditoría sin datos de clientes ─────
  perform tests.assert(tests.val_as(padm, 'select count(*) from public.tenants')::int = 3, 'platform admin audits tenants');
  perform tests.assert(tests.val_as(padm, 'select count(*) from public.audit_logs')::int > 0, 'platform admin reads audit logs');
  perform tests.assert(tests.val_as(padm, 'select count(*) from public.tenant_subscriptions')::int = 1, 'platform admin reads subscriptions');
  perform tests.assert(tests.val_as(padm, 'select count(*) from public.orders')::int = 0, 'platform admin cannot read orders');
  perform tests.assert(tests.val_as(padm, 'select count(*) from public.customers')::int = 0, 'platform admin cannot read customers');
  perform tests.assert(tests.val_as(padm, 'select count(*) from public.messages')::int = 0, 'platform admin cannot read messages');
  perform tests.assert(tests.val_as(padm, 'select count(*) from public.payment_proofs')::int = 0, 'platform admin cannot read proofs');

  -- ───── Impago: el operador queda suspendido, el dueño solo lee ─────
  update public.tenant_subscriptions set status = 'canceled' where tenant_id = tA;
  perform tests.assert(tests.val_as(opA, 'select count(*) from public.orders')::int = 0, 'lapsed: operator sees no orders');
  perform tests.assert(tests.val_as(ownA, 'select count(*) from public.orders')::int = 3, 'lapsed: owner keeps read-only view');
  perform tests.assert(tests.try_as(opA, format($q$select public.advance_order(%L,'cancelled','x')$q$, o2)) like '%Not found%', 'lapsed: operator cannot operate');
  perform tests.assert((tests.val_as(null, format($q$select public.get_public_storefront(%L)::text$q$, slugA), 'anon')::jsonb) ->> 'available' = 'false', 'lapsed: public shop unavailable');
  begin perform public.create_order_from_cart(cart, 'pickup', null, null, pm, 'wamid.NEW'); raise exception 'FAILED: order created without subscription';
  exception when others then if sqlerrm not like '%CART_NOT_ACTIVE%' and sqlerrm not like '%TENANT_NOT_BILLABLE%' then raise; end if; end;
  update public.tenant_subscriptions set status = 'past_due', past_due_since = now() - interval '3 days' where tenant_id = tA;
  perform tests.assert(public.tenant_is_billable(tA), 'past_due inside grace period stays billable');
  update public.tenant_subscriptions set past_due_since = now() - interval '8 days' where tenant_id = tA;
  perform tests.assert(not public.tenant_is_billable(tA), 'past_due beyond 7 days is blocked');

  -- ───── Límite de intentos ─────
  ok := true;
  for i in 1..5 loop ok := ok and public.take_attempt('login_email', 'hash1', 5, 900); end loop;
  perform tests.assert(ok and not public.take_attempt('login_email', 'hash1', 5, 900), 'rate limit blocks the 6th attempt');

  -- ───── Baja del comercio: el borrado en cascada no se bloquea por la inmutabilidad ─────
  delete from public.tenants where id = tA;
  perform tests.assert((select count(*) from public.orders where tenant_id = tA) = 0, 'tenant offboarding cascades');

  raise exception 'ALL_SECURITY_TESTS_PASSED';
end $$;
