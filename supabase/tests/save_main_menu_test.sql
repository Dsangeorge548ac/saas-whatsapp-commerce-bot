-- Pruebas de 0023 (editor del menú principal). Termina con ALL_MENU_TESTS_PASSED, que revierte todo.
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
declare own uuid := gen_random_uuid(); other uuid := gen_random_uuid(); op uuid := gen_random_uuid(); t uuid; t2 uuid;
  cat uuid; foreign_cat uuid; menu uuid; items text;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email, now(), '{}'::jsonb, now(), now()
  from (values (own,'menu-own@t.test'),(other,'menu-other@t.test'),(op,'menu-op@t.test')) as u(id, email);
  t := tests.val_as(own, $q$select public.create_tenant('Menú Uno','store')$q$)::uuid;
  t2 := tests.val_as(other, $q$select public.create_tenant('Menú Dos','store')$q$)::uuid;
  insert into public.tenant_members (tenant_id, user_id, role) values (t, op, 'operator');
  insert into public.categories (tenant_id, name) values (t, 'Panes') returning id into cat;
  insert into public.categories (tenant_id, name) values (t2, 'Ajena') returning id into foreign_cat;

  items := format('[{"title":"Pedir","description":"Ver catálogo","action":"start_order"},{"title":"Panes","action":"show_category","category_id":"%s"},{"title":"Asesor","action":"request_agent"}]', cat);

  -- Crea el menú si no existía y guarda las opciones en orden.
  perform tests.assert(tests.val_as(own, format($q$select public.save_main_menu(%L, 'Elige una opción:', 'Ver opciones', %L::jsonb)$q$, t, items)) = 'ok', 'owner saves');
  select id into menu from public.bot_menus where tenant_id = t and key = 'main';
  perform tests.assert(menu is not null, 'menu created');
  perform tests.assert((select count(*) from public.bot_menu_items where menu_id = menu) = 3, '3 items');
  perform tests.assert((select title from public.bot_menu_items where menu_id = menu and sort_order = 2) = 'Panes', 'order kept');

  -- Reemplaza las opciones al volver a guardar.
  perform tests.assert(tests.val_as(own, format($q$select public.save_main_menu(%L, 'Hola', 'Opciones', '[{"title":"Info","action":"business_info"}]'::jsonb)$q$, t)) = 'ok', 'owner replaces');
  perform tests.assert((select count(*) from public.bot_menu_items where menu_id = menu) = 1, 'replaced');
  perform tests.assert((select body from public.bot_menus where id = menu) = 'Hola', 'body updated');

  -- Solo el dueño de ESTE comercio, y nada ajeno.
  perform tests.assert(tests.val_as(op, format($q$select public.save_main_menu(%L, 'x', 'x', '[{"title":"Info","action":"business_info"}]'::jsonb)$q$, t)) like 'ERR:Not found%', 'operator blocked');
  perform tests.assert(tests.val_as(other, format($q$select public.save_main_menu(%L, 'x', 'x', '[{"title":"Info","action":"business_info"}]'::jsonb)$q$, t)) like 'ERR:Not found%', 'other owner blocked');
  perform tests.assert(tests.val_as(own, format($q$select public.save_main_menu(%L, 'x', 'x', '[{"title":"Ajena","action":"show_category","category_id":"%s"}]'::jsonb)$q$, t, foreign_cat)) like 'ERR:INVALID_CATEGORY%', 'foreign category rejected');
  perform tests.assert(tests.val_as(null, format($q$select public.save_main_menu(%L, 'x', 'x', '[]'::jsonb)$q$, t), 'anon') like 'ERR:permission denied%', 'anon blocked');

  -- Límites de WhatsApp.
  perform tests.assert(tests.val_as(own, format($q$select public.save_main_menu(%L, 'x', 'x', '[]'::jsonb)$q$, t)) like 'ERR:INVALID_ITEMS%', 'at least one item');
  perform tests.assert(tests.val_as(own, format($q$select public.save_main_menu(%L, 'x', 'x', (select jsonb_agg(jsonb_build_object('title','Info','action','business_info')) from generate_series(1,11)))$q$, t)) like 'ERR:INVALID_ITEMS%', 'max 10 items');
  perform tests.assert(tests.val_as(own, format($q$select public.save_main_menu(%L, 'x', 'x', '[{"title":"Un título demasiado largo para WA","action":"business_info"}]'::jsonb)$q$, t)) like 'ERR:INVALID_ITEM_TITLE%', 'title 24 max');
  perform tests.assert(tests.val_as(own, format($q$select public.save_main_menu(%L, 'x', 'Etiqueta de botón muy larga', '[{"title":"Info","action":"business_info"}]'::jsonb)$q$, t)) like 'ERR:INVALID_BUTTON%', 'button 20 max');
  perform tests.assert(tests.val_as(own, format($q$select public.save_main_menu(%L, 'x', 'x', '[{"title":"Sub","action":"submenu"}]'::jsonb)$q$, t)) like 'ERR:INVALID_ACTION%', 'submenu not allowed here');
  -- Un error no deja el menú a medias: sigue la opción guardada antes.
  perform tests.assert((select count(*) from public.bot_menu_items where menu_id = menu) = 1, 'nothing changed after errors');

  raise exception 'ALL_MENU_TESTS_PASSED';
end $$;
