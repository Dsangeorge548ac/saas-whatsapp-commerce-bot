-- 0023: el dueño edita el MENÚ PRINCIPAL del bot (texto, botón de la lista y opciones).
-- save_main_menu guarda todo en UNA transacción: crea el menú si no existe, actualiza su texto y reemplaza las
-- opciones (1 a 10, como permite WhatsApp: hasta 3 se envían como botones y hasta 10 como lista).
-- Valida dentro de la base (no confía en la app): solo el dueño; textos con los límites de WhatsApp; acciones
-- permitidas; la categoría o el producto elegidos deben ser de ESTE comercio.
create function public.save_main_menu(p_tenant uuid, p_body text, p_button_label text, p_items jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_menu uuid;
  v_item jsonb;
  v_pos integer := 0;
  v_action text;
  v_title text;
  v_desc text;
  v_category uuid;
  v_product uuid;
begin
  if not public.is_tenant_owner(p_tenant) then raise exception 'Not found' using errcode = 'P0002'; end if;
  p_body := btrim(coalesce(p_body, ''));
  p_button_label := btrim(coalesce(p_button_label, ''));
  if char_length(p_body) not between 1 and 1024 then raise exception 'INVALID_BODY'; end if;
  if char_length(p_button_label) not between 1 and 20 then raise exception 'INVALID_BUTTON'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 10 then raise exception 'INVALID_ITEMS'; end if;

  select id into v_menu from public.bot_menus where tenant_id = p_tenant and key = 'main';
  if v_menu is null then
    insert into public.bot_menus (tenant_id, key, title, body, button_label)
    values (p_tenant, 'main', 'Menú principal', p_body, p_button_label) returning id into v_menu;
  else
    update public.bot_menus set body = p_body, button_label = p_button_label where id = v_menu;
  end if;

  delete from public.bot_menu_items where menu_id = v_menu and tenant_id = p_tenant;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_pos := v_pos + 1;
    v_title := btrim(coalesce(v_item->>'title', ''));
    v_desc := nullif(btrim(coalesce(v_item->>'description', '')), '');
    v_action := v_item->>'action';
    v_category := null;
    v_product := null;
    if char_length(v_title) not between 1 and 24 then raise exception 'INVALID_ITEM_TITLE'; end if;
    if v_desc is not null and char_length(v_desc) > 72 then raise exception 'INVALID_ITEM_DESCRIPTION'; end if;
    if v_action not in ('start_order', 'show_category', 'show_product', 'business_info', 'request_agent') then raise exception 'INVALID_ACTION'; end if;
    if v_action = 'show_category' then
      v_category := (v_item->>'category_id')::uuid;
      if not exists (select 1 from public.categories where id = v_category and tenant_id = p_tenant) then raise exception 'INVALID_CATEGORY'; end if;
    elsif v_action = 'show_product' then
      v_product := (v_item->>'product_id')::uuid;
      if not exists (select 1 from public.products where id = v_product and tenant_id = p_tenant) then raise exception 'INVALID_PRODUCT'; end if;
    end if;
    insert into public.bot_menu_items (tenant_id, menu_id, title, description, action, category_id, product_id, sort_order)
    values (p_tenant, v_menu, v_title, v_desc, v_action::public.menu_action, v_category, v_product, v_pos);
  end loop;

  perform public.log_audit((select auth.uid()), 'BOT_MENU_UPDATED', 'bot_menus', p_tenant, null, null, jsonb_build_object('items', v_pos));
end;
$$;
revoke execute on function public.save_main_menu(uuid, text, text, jsonb) from public, anon;
grant execute on function public.save_main_menu(uuid, text, text, jsonb) to authenticated;
