-- 0014_delivery_location: ubicación GPS del cliente para el delivery.
--
-- Flujo: al elegir "delivery" el bot manda el mensaje interactivo de WhatsApp "location_request_message"
-- (botón "Enviar ubicación"); el cliente responde con un mensaje de tipo `location` (latitud/longitud).
-- La ubicación es un dato personal SENSIBLE: vive solo en el pedido (snapshot inmutable) y en las
-- direcciones del cliente, con la misma RLS (dueño siempre, operador con suscripción vigente). Nunca va
-- a logs, a auditoría ni a URLs de la app. El operador la abre en el mapa desde el panel.
-- Si el comercio exige ubicación (por defecto sí), un pedido de delivery sin coordenadas se rechaza.

alter table public.tenant_settings add column require_delivery_location boolean not null default true;
grant update (require_delivery_location) on public.tenant_settings to authenticated;

-- Direcciones reutilizables del cliente (coordenadas opcionales, siempre las dos o ninguna).
alter table public.customer_addresses
  add column lat numeric(9,6),
  add column lng numeric(9,6),
  add constraint customer_addresses_location_chk
    check ((lat is null) = (lng is null) and (lat is null or (lat between -90 and 90 and lng between -180 and 180)));

-- Pedido: ubicación congelada al pedir.
alter table public.orders
  add column delivery_lat numeric(9,6),
  add column delivery_lng numeric(9,6),
  add constraint orders_location_chk
    check ((delivery_lat is null) = (delivery_lng is null)
           and (delivery_lat is null or (delivery_lat between -90 and 90 and delivery_lng between -180 and 180)));

-- Delivery: hace falta una dirección en texto O las coordenadas (antes solo texto).
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.orders'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%fulfillment%pickup%delivery_address_text%';
  if c is not null then execute format('alter table public.orders drop constraint %I', c); end if;
end $$;
alter table public.orders add constraint orders_delivery_target_chk
  check (fulfillment = 'pickup' or delivery_address_text is not null or delivery_lat is not null);

-- FSM: delivery → awaiting_location (pide GPS) → awaiting_address (referencia) → awaiting_notes.
create or replace function public.session_transition_allowed(p_from public.session_state, p_to public.session_state)
returns boolean language sql immutable set search_path = '' as $$
  select p_from = p_to or (p_from <> 'closed' and (
    p_to in ('idle', 'closed', 'human_handoff', 'browsing_menu', 'browsing_catalog')
    or case p_to
      when 'building_cart' then p_from in ('idle', 'browsing_menu', 'browsing_catalog', 'awaiting_cart_confirmation', 'awaiting_location', 'awaiting_address')
      when 'awaiting_cart_confirmation' then p_from = 'building_cart'
      when 'awaiting_location' then p_from in ('awaiting_cart_confirmation', 'awaiting_address')
      when 'awaiting_address' then p_from in ('awaiting_cart_confirmation', 'awaiting_location', 'awaiting_notes')
      when 'awaiting_notes' then p_from in ('awaiting_location', 'awaiting_address', 'awaiting_payment_method', 'awaiting_cart_confirmation')
      when 'awaiting_payment_method' then p_from in ('awaiting_notes', 'awaiting_proof', 'awaiting_location', 'awaiting_address', 'awaiting_cart_confirmation')
      when 'awaiting_proof' then p_from in ('awaiting_payment_method', 'awaiting_review')
      when 'awaiting_review' then p_from = 'awaiting_proof'
      else false end));
$$;

-- Crear pedido desde el carrito: ahora recibe la ubicación (misma lógica de antes + validación GPS).
drop function public.create_order_from_cart(uuid, public.delivery_mode, text, text, uuid, text);
create function public.create_order_from_cart(
  p_cart uuid, p_fulfillment public.delivery_mode, p_address text, p_notes text,
  p_payment_method uuid, p_source_wamid text, p_lat numeric default null, p_lng numeric default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_cart public.carts;
  v_cust public.customers;
  v_set public.tenant_settings;
  v_pm public.tenant_payment_methods;
  v_order uuid;
  v_subtotal numeric(14,2);
  v_lines integer;
  v_all_available boolean;
  v_fee numeric(14,2) := 0;
  v_limit integer;
  v_number integer;
  v_has_loc boolean := (p_lat is not null and p_lng is not null);
begin
  select * into v_cart from public.carts where id = p_cart for update;
  if not found then raise exception 'CART_NOT_FOUND'; end if;

  if p_source_wamid is not null then
    select id into v_order from public.orders where tenant_id = v_cart.tenant_id and source_wamid = p_source_wamid;
    if found then return v_order; end if;
  end if;

  if v_cart.status <> 'active' then raise exception 'CART_NOT_ACTIVE'; end if;
  if not public.tenant_is_billable(v_cart.tenant_id) then raise exception 'TENANT_NOT_BILLABLE'; end if;
  select * into v_set from public.tenant_settings where tenant_id = v_cart.tenant_id;
  if not v_set.bot_enabled then raise exception 'BOT_DISABLED'; end if;

  -- Las dos coordenadas o ninguna, y dentro de rango.
  if (p_lat is null) <> (p_lng is null) or (v_has_loc and not (p_lat between -90 and 90 and p_lng between -180 and 180)) then
    raise exception 'LOCATION_INVALID';
  end if;

  if p_fulfillment = 'delivery' then
    if not v_set.accepts_delivery then raise exception 'DELIVERY_NOT_AVAILABLE'; end if;
    if v_set.require_delivery_location and not v_has_loc then raise exception 'LOCATION_REQUIRED'; end if;
    if btrim(coalesce(p_address, '')) = '' and not v_has_loc then raise exception 'ADDRESS_REQUIRED'; end if;
    v_fee := v_set.delivery_fee;
  elsif not v_set.accepts_pickup then
    raise exception 'PICKUP_NOT_AVAILABLE';
  end if;

  select p.max_orders_per_month into v_limit
    from public.tenant_subscriptions s join public.plans p on p.id = s.plan_id where s.tenant_id = v_cart.tenant_id;
  if v_limit is not null and (select count(*) from public.orders
       where tenant_id = v_cart.tenant_id and placed_at >= date_trunc('month', now())) >= v_limit then
    raise exception 'ORDER_LIMIT_REACHED';
  end if;

  select c.* into v_cust from public.customers c
    join public.conversation_sessions s on s.customer_id = c.id and s.tenant_id = c.tenant_id
   where s.id = v_cart.session_id;
  select * into v_pm from public.tenant_payment_methods
   where id = p_payment_method and tenant_id = v_cart.tenant_id and is_active;
  if not found then raise exception 'PAYMENT_METHOD_INVALID'; end if;

  select coalesce(sum(ci.quantity * p.price), 0), count(*), coalesce(bool_and(p.is_available), false)
    into v_subtotal, v_lines, v_all_available
    from public.cart_items ci join public.products p on p.id = ci.product_id and p.tenant_id = ci.tenant_id
   where ci.cart_id = p_cart;
  if v_lines = 0 then raise exception 'CART_EMPTY'; end if;
  if not v_all_available then raise exception 'PRODUCT_UNAVAILABLE'; end if;

  update public.tenant_counters set order_seq = order_seq + 1
   where tenant_id = v_cart.tenant_id returning order_seq into v_number;

  insert into public.orders (tenant_id, order_number, customer_id, session_id, fulfillment,
      customer_name_snapshot, customer_phone_snapshot, delivery_address_text, delivery_notes, delivery_lat, delivery_lng,
      currency, subtotal, delivery_fee, total, payment_method_type, payment_details_snapshot, source_wamid)
  values (v_cart.tenant_id, v_number, v_cust.id, v_cart.session_id, p_fulfillment,
      v_cust.profile_name, v_cust.phone_e164, nullif(btrim(p_address), ''), nullif(btrim(p_notes), ''),
      case when p_fulfillment = 'delivery' then p_lat end, case when p_fulfillment = 'delivery' then p_lng end,
      v_set.currency, v_subtotal, v_fee, v_subtotal + v_fee, v_pm.type,
      jsonb_build_object('label', v_pm.label, 'currency', v_pm.currency, 'details', v_pm.details), p_source_wamid)
  returning id into v_order;

  insert into public.order_items (tenant_id, order_id, product_id, product_name_snapshot, unit_price, quantity, line_total)
  select ci.tenant_id, v_order, p.id, p.name, p.price, ci.quantity, p.price * ci.quantity
    from public.cart_items ci join public.products p on p.id = ci.product_id and p.tenant_id = ci.tenant_id
   where ci.cart_id = p_cart;

  update public.carts set status = 'converted' where id = p_cart;
  return v_order;
end;
$$;
revoke execute on function public.create_order_from_cart(uuid, public.delivery_mode, text, text, uuid, text, numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.create_order_from_cart(uuid, public.delivery_mode, text, text, uuid, text, numeric, numeric) to service_role;

-- Mensajes estándar para pedir y confirmar la ubicación (editables por el comercio).
update public.message_template_defaults
   set body = 'Escribe una referencia para el repartidor (calle, casa o punto de referencia).',
       description = 'Pide una referencia de la dirección, además de la ubicación GPS.'
 where key = 'ask_address';
insert into public.message_template_defaults (key, business_type, stage, description, body, allowed_placeholders, required_placeholders, sort_order) values
 ('ask_location','all','address','Pide la ubicación GPS para el delivery (el cliente toca el botón "Enviar ubicación").',
  E'📍 Para llevarte el pedido necesitamos tu ubicación. Toca el botón de abajo para compartirla.\nTambién puedes enviarla desde el clip 📎 > Ubicación.','{}','{}',65),
 ('location_received','all','address','Confirma que recibimos la ubicación.',
  '✅ ¡Ubicación recibida!','{}','{}',66),
 ('location_invalid','all','address','Cuando el cliente responde sin compartir una ubicación válida.',
  'No pudimos leer tu ubicación. Toca el botón "Enviar ubicación" o usa el clip 📎 > Ubicación.','{}','{}',67);
