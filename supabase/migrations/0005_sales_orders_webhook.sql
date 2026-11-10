-- 0005_sales_orders_webhook: clientes finales, sesiones (FSM), carrito, pedidos, comprobantes,
-- mensajes y cola de webhook.
--
-- Datos personales: customers (teléfono), customer_addresses, orders (snapshots), messages (texto).
-- Lectura: dueño siempre (solo lectura) u operador con suscripción vigente (can_view_operations).
-- Escritura: NADIE desde el cliente. Escribe el servidor (service role) y las RPC SECURITY DEFINER.
-- Los pedidos son contablemente inmutables: solo cambia el estado, y cada cambio queda en el historial.

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  profile_name text check (char_length(profile_name) <= 120),
  opted_out boolean not null default false,
  anonymized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, phone_e164),                  -- también sirve de índice para el webhook
  unique (tenant_id, id)
);
create trigger customers_updated before update on public.customers
  for each row execute function public.set_updated_at();

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  customer_id uuid not null,
  address_text text not null check (char_length(address_text) between 5 and 500),
  reference text check (char_length(reference) <= 200),
  created_at timestamptz not null default now(),
  foreign key (tenant_id, customer_id) references public.customers (tenant_id, id) on delete cascade
);
create index customer_addresses_idx on public.customer_addresses (customer_id);

-- ───────── Sesión de conversación (máquina de estados) ─────────
create table public.conversation_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  customer_id uuid not null,
  state public.session_state not null default 'idle',
  state_context jsonb not null default '{}'::jsonb
    check (jsonb_typeof(state_context) = 'object' and char_length(state_context::text) <= 8000), -- solo datos efímeros
  mode public.session_mode not null default 'bot',
  assigned_to uuid references public.profiles (id) on delete set null,
  handoff_requested_at timestamptz,
  last_inbound_at timestamptz,
  window_expires_at timestamptz,                   -- ventana de 24 h de Meta
  expires_at timestamptz,                          -- TTL del carrito
  version integer not null default 1,              -- control optimista de concurrencia
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, customer_id) references public.customers (tenant_id, id) on delete cascade,
  check (mode <> 'human' or handoff_requested_at is not null)
);
-- Una sola sesión abierta por cliente.
create unique index conversation_sessions_open_idx on public.conversation_sessions (tenant_id, customer_id)
  where closed_at is null;
-- Cola de asesor: sesiones en modo humano sin tomar.
create index conversation_sessions_queue_idx on public.conversation_sessions (tenant_id, handoff_requested_at)
  where mode = 'human' and assigned_to is null and closed_at is null;
create index conversation_sessions_expiry_idx on public.conversation_sessions (expires_at) where closed_at is null;

-- Transiciones válidas de la FSM (la base rechaza saltos ilegales; closed es terminal).
create function public.session_transition_allowed(p_from public.session_state, p_to public.session_state)
returns boolean language sql immutable set search_path = '' as $$
  select p_from = p_to or (p_from <> 'closed' and (
    p_to in ('idle', 'closed', 'human_handoff', 'browsing_menu', 'browsing_catalog')
    or case p_to
      when 'building_cart' then p_from in ('idle', 'browsing_menu', 'browsing_catalog', 'awaiting_cart_confirmation', 'awaiting_address')
      when 'awaiting_cart_confirmation' then p_from = 'building_cart'
      when 'awaiting_address' then p_from in ('awaiting_cart_confirmation', 'awaiting_notes')
      when 'awaiting_notes' then p_from in ('awaiting_address', 'awaiting_payment_method', 'awaiting_cart_confirmation')
      when 'awaiting_payment_method' then p_from in ('awaiting_notes', 'awaiting_proof', 'awaiting_address', 'awaiting_cart_confirmation')
      when 'awaiting_proof' then p_from in ('awaiting_payment_method', 'awaiting_review')
      when 'awaiting_review' then p_from = 'awaiting_proof'
      else false end));
$$;

create function public.session_before_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.state is distinct from old.state and not public.session_transition_allowed(old.state, new.state) then
    raise exception 'Invalid session transition % -> %', old.state, new.state;
  end if;
  new.version = old.version + 1;
  new.updated_at = now();
  return new;
end;
$$;
create trigger conversation_sessions_before_update before update on public.conversation_sessions
  for each row execute function public.session_before_update();

-- ───────── Carrito temporal (no reserva nada) ─────────
create table public.carts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  session_id uuid not null unique,
  status public.cart_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, session_id) references public.conversation_sessions (tenant_id, id) on delete cascade
);
create trigger carts_updated before update on public.carts
  for each row execute function public.set_updated_at();

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  cart_id uuid not null,
  product_id uuid not null,
  quantity integer not null check (quantity between 1 and 999),
  unit_price_snapshot numeric(14,2) not null check (unit_price_snapshot >= 0),  -- se re-valida al confirmar
  created_at timestamptz not null default now(),
  unique (cart_id, product_id),
  foreign key (tenant_id, cart_id) references public.carts (tenant_id, id) on delete cascade,
  foreign key (tenant_id, product_id) references public.products (tenant_id, id) on delete cascade
);

-- ───────── Pedidos ─────────
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  order_number integer not null,
  customer_id uuid not null,
  session_id uuid,
  status public.order_status not null default 'pending',
  fulfillment public.delivery_mode not null,
  -- Snapshots: la dirección, el cliente y el método de pago se congelan al pedir.
  customer_name_snapshot text,
  customer_phone_snapshot text not null,
  delivery_address_text text check (char_length(delivery_address_text) <= 500),
  delivery_notes text check (char_length(delivery_notes) <= 500),
  currency text not null check (currency ~ '^[A-Z]{3,4}$'),
  subtotal numeric(14,2) not null check (subtotal >= 0),
  delivery_fee numeric(14,2) not null default 0 check (delivery_fee >= 0),
  total numeric(14,2) not null,
  payment_method_type public.payment_method_type not null,
  payment_details_snapshot jsonb not null default '{}'::jsonb,
  source_wamid text,                               -- idempotencia: un mensaje de Meta crea a lo sumo un pedido
  placed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, order_number),
  unique (tenant_id, source_wamid),
  foreign key (tenant_id, customer_id) references public.customers (tenant_id, id),  -- sin cascada directa: se anonimiza, no se borra
  foreign key (tenant_id, session_id) references public.conversation_sessions (tenant_id, id) on delete set null (session_id),
  check (total = subtotal + delivery_fee),
  check (fulfillment = 'pickup' or delivery_address_text is not null)
);
-- Kanban: columna + orden, y un índice parcial solo con los pedidos vivos.
create index orders_status_idx on public.orders (tenant_id, status, created_at desc);
create index orders_live_idx on public.orders (tenant_id, status, updated_at desc)
  where status in ('pending', 'approved', 'on_the_way');
create index orders_customer_idx on public.orders (tenant_id, customer_id, created_at desc);
create trigger orders_updated before update on public.orders
  for each row execute function public.set_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  order_id uuid not null,
  product_id uuid,                                 -- navegación; pasa a NULL si el producto se borra
  product_name_snapshot text not null,
  unit_price numeric(14,2) not null check (unit_price >= 0),
  quantity integer not null check (quantity between 1 and 999),
  line_total numeric(14,2) not null,
  check (line_total = unit_price * quantity),
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete cascade,
  foreign key (tenant_id, product_id) references public.products (tenant_id, id) on delete set null (product_id)
);
create index order_items_order_idx on public.order_items (order_id);

-- Historial inmutable de estados (quién, cuándo y por qué).
create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  order_id uuid not null,
  from_status public.order_status,
  to_status public.order_status not null,
  actor_type public.sender_type not null,
  actor_user_id uuid references public.profiles (id) on delete set null,
  reason text check (char_length(reason) <= 300),
  created_at timestamptz not null default now(),
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete cascade
);
create index order_status_history_idx on public.order_status_history (order_id, created_at);
create trigger order_status_history_immutable before update or delete on public.order_status_history
  for each row execute function public.forbid_modification();

-- Los renglones no se editan; el único UPDATE permitido es el del FK (producto borrado → NULL).
create function public.guard_order_items() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() > 1 then return old; end if;
    raise exception 'Order items are immutable' using errcode = '42501';
  end if;
  if new.product_id is not null or (to_jsonb(new) - 'product_id') <> (to_jsonb(old) - 'product_id') then
    raise exception 'Order items are immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger order_items_guard before update or delete on public.order_items
  for each row execute function public.guard_order_items();

-- Mutabilidad del pedido: solo status (y notas de entrega vacías no existen: todo lo contable se congela).
create function public.guard_order_update() returns trigger
language plpgsql set search_path = '' as $$
declare v_reason text := coalesce(current_setting('app.status_reason', true), '');
begin
  if (to_jsonb(new) - 'status' - 'updated_at') <> (to_jsonb(old) - 'status' - 'updated_at') then
    raise exception 'Order data is immutable; only the status can change' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    -- Secuencia obligatoria; cancelar solo antes de salir a reparto y con motivo.
    if not ((old.status = 'pending' and new.status in ('approved', 'cancelled'))
         or (old.status = 'approved' and new.status in ('on_the_way', 'cancelled'))
         or (old.status = 'on_the_way' and new.status = 'delivered')) then
      raise exception 'Invalid order transition % -> %', old.status, new.status;
    end if;
    if new.status = 'cancelled' and btrim(v_reason) = '' then
      raise exception 'A reason is required to cancel an order';
    end if;
  end if;
  return new;
end;
$$;
create trigger orders_guard before update on public.orders
  for each row execute function public.guard_order_update();

-- Historial automático: nadie cambia el estado sin dejar rastro, ni siquiera la service role.
create function public.log_order_status() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_actor text := nullif(current_setting('app.actor_type', true), '');
  v_reason text := nullif(current_setting('app.status_reason', true), '');
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return new; end if;
  insert into public.order_status_history (tenant_id, order_id, from_status, to_status, actor_type, actor_user_id, reason)
  values (new.tenant_id, new.id, case when tg_op = 'UPDATE' then old.status end, new.status,
          coalesce(v_actor, case when (select auth.uid()) is null then 'system' else 'operator' end)::public.sender_type,
          (select auth.uid()), v_reason);
  return new;
end;
$$;
revoke execute on function public.log_order_status() from public, anon, authenticated;
create trigger orders_log_status_ins after insert on public.orders
  for each row execute function public.log_order_status();
create trigger orders_log_status_upd after update of status on public.orders
  for each row execute function public.log_order_status();

-- ───────── Comprobantes de pago ─────────
create table public.payment_proofs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  order_id uuid not null,
  storage_path text,                               -- ruta en Storage privado; nunca URL
  reference_number text check (char_length(reference_number) <= 60),
  amount_declared numeric(14,2) check (amount_declared >= 0),
  status public.proof_status not null default 'submitted',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text check (char_length(rejection_reason) <= 300),
  created_at timestamptz not null default now(),
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete cascade,
  check (storage_path is not null or reference_number is not null),
  check (status = 'submitted' or reviewed_at is not null),
  check (status <> 'rejected' or rejection_reason is not null)
);
-- Un solo comprobante pendiente de revisión por pedido.
create unique index payment_proofs_one_open_idx on public.payment_proofs (order_id) where status = 'submitted';
create index payment_proofs_queue_idx on public.payment_proofs (tenant_id, created_at) where status = 'submitted';

-- ───────── Mensajes y webhook ─────────
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  customer_id uuid not null,
  session_id uuid,
  wamid text,                                      -- id de Meta (null mientras un saliente no se envía)
  direction public.message_direction not null,
  sender_type public.sender_type not null,
  sender_user_id uuid references public.profiles (id) on delete set null,   -- auditoría humano vs. automático
  message_type public.message_type not null default 'text',
  body text check (char_length(body) <= 4096),
  payload jsonb not null default '{}'::jsonb,
  delivery_status text check (delivery_status in ('queued', 'sent', 'delivered', 'read', 'failed')),
  created_at timestamptz not null default now(),
  unique (tenant_id, wamid),                       -- idempotencia: un mensaje de Meta se registra una sola vez
  foreign key (tenant_id, customer_id) references public.customers (tenant_id, id) on delete cascade,
  foreign key (tenant_id, session_id) references public.conversation_sessions (tenant_id, id) on delete set null (session_id)
);
create index messages_chat_idx on public.messages (tenant_id, customer_id, created_at desc, id desc);

-- Entrada cruda del webhook: idempotencia + reintento. Solo service role.
create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete cascade,   -- null si aún no se resolvió el número
  event_key text not null unique,                  -- wamid, o wamid:status para actualizaciones de estado
  payload jsonb not null,
  status public.webhook_status not null default 'received',
  attempts integer not null default 0,
  last_error text check (char_length(last_error) <= 500),
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create index webhook_events_pending_idx on public.webhook_events (received_at) where status <> 'processed';

-- ───────── RPC: crear pedido desde el carrito (solo service role / bot) ─────────
-- Una sola transacción: re-precia, valida disponibilidad y límites del plan, congela snapshots y
-- convierte el carrito. Idempotente por source_wamid (los reintentos de Meta no duplican pedidos).
create function public.create_order_from_cart(
  p_cart uuid, p_fulfillment public.delivery_mode, p_address text, p_notes text,
  p_payment_method uuid, p_source_wamid text
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

  if p_fulfillment = 'delivery' then
    if not v_set.accepts_delivery then raise exception 'DELIVERY_NOT_AVAILABLE'; end if;
    if btrim(coalesce(p_address, '')) = '' then raise exception 'ADDRESS_REQUIRED'; end if;
    v_fee := v_set.delivery_fee;
  elsif not v_set.accepts_pickup then
    raise exception 'PICKUP_NOT_AVAILABLE';
  end if;

  -- Límite de pedidos del plan (null = ilimitado).
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

  -- Re-precia con los precios vigentes del catálogo.
  select coalesce(sum(ci.quantity * p.price), 0), count(*), coalesce(bool_and(p.is_available), false)
    into v_subtotal, v_lines, v_all_available
    from public.cart_items ci join public.products p on p.id = ci.product_id and p.tenant_id = ci.tenant_id
   where ci.cart_id = p_cart;
  if v_lines = 0 then raise exception 'CART_EMPTY'; end if;
  if not v_all_available then raise exception 'PRODUCT_UNAVAILABLE'; end if;

  update public.tenant_counters set order_seq = order_seq + 1
   where tenant_id = v_cart.tenant_id returning order_seq into v_number;

  insert into public.orders (tenant_id, order_number, customer_id, session_id, fulfillment,
      customer_name_snapshot, customer_phone_snapshot, delivery_address_text, delivery_notes, currency,
      subtotal, delivery_fee, total, payment_method_type, payment_details_snapshot, source_wamid)
  values (v_cart.tenant_id, v_number, v_cust.id, v_cart.session_id, p_fulfillment,
      v_cust.profile_name, v_cust.phone_e164, nullif(btrim(p_address), ''), nullif(btrim(p_notes), ''), v_set.currency,
      v_subtotal, v_fee, v_subtotal + v_fee, v_pm.type,
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

-- ───────── RPC: operar pedidos y comprobantes ─────────
-- Avanza un pedido (operador/dueño de un comercio con suscripción vigente). La secuencia y el
-- historial los impone el trigger; aquí se valida quién puede y se audita.
create function public.advance_order(p_order uuid, p_to public.order_status, p_reason text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from public.orders where id = p_order;
  if v_tenant is null or not public.can_operate(v_tenant) then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  perform set_config('app.actor_type', 'operator', true);
  perform set_config('app.status_reason', coalesce(left(p_reason, 300), ''), true);
  update public.orders set status = p_to where id = p_order;
  perform public.log_audit((select auth.uid()), 'ORDER_STATUS_CHANGED', 'orders', v_tenant, null, null,
    jsonb_build_object('order_id', p_order, 'to', p_to));
end;
$$;

-- Versión del servidor (webhook): p. ej. el cliente confirma "recibido" → delivered.
create function public.advance_order_system(
  p_order uuid, p_to public.order_status, p_actor public.sender_type, p_reason text default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.actor_type', p_actor::text, true);
  perform set_config('app.status_reason', coalesce(left(p_reason, 300), ''), true);
  update public.orders set status = p_to where id = p_order;
  if not found then raise exception 'Not found' using errcode = 'P0002'; end if;
end;
$$;

-- Revisa un comprobante: aceptar aprueba el pedido en la misma transacción; rechazar exige motivo.
create function public.review_proof(p_proof uuid, p_decision text, p_reason text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_proof public.payment_proofs;
begin
  select * into v_proof from public.payment_proofs where id = p_proof for update;
  if not found or not public.can_operate(v_proof.tenant_id) then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  if v_proof.status <> 'submitted' then raise exception 'Proof already reviewed'; end if;

  if p_decision = 'accept' then
    update public.payment_proofs set status = 'accepted', reviewed_by = v_uid, reviewed_at = now() where id = p_proof;
    perform set_config('app.actor_type', 'operator', true);
    perform set_config('app.status_reason', 'Payment proof accepted', true);
    update public.orders set status = 'approved' where id = v_proof.order_id and status = 'pending';
  elsif p_decision = 'reject' then
    if btrim(coalesce(p_reason, '')) = '' then raise exception 'A reason is required'; end if;
    update public.payment_proofs set status = 'rejected', reviewed_by = v_uid, reviewed_at = now(),
           rejection_reason = left(btrim(p_reason), 300) where id = p_proof;
  else
    raise exception 'Invalid decision';
  end if;
  perform public.log_audit(v_uid, 'PROOF_' || upper(p_decision) || 'ED', 'payment_proofs', v_proof.tenant_id, null, null,
    jsonb_build_object('proof_id', p_proof, 'order_id', v_proof.order_id));
end;
$$;

-- Atención humana: tomar la sesión es atómico (si dos operadores la toman a la vez, gana uno).
create function public.claim_session(p_session uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_s public.conversation_sessions;
begin
  select * into v_s from public.conversation_sessions where id = p_session for update;
  if not found or not public.can_operate(v_s.tenant_id) then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  if v_s.mode <> 'human' or v_s.assigned_to is not null then raise exception 'ALREADY_CLAIMED'; end if;
  update public.conversation_sessions set assigned_to = (select auth.uid()) where id = p_session;
  perform public.log_audit((select auth.uid()), 'SESSION_CLAIMED', 'conversation_sessions', v_s.tenant_id, null, null,
    jsonb_build_object('session_id', p_session));
end;
$$;

-- Devuelve la conversación al bot (quien la atiende o el dueño).
create function public.release_session(p_session uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_s public.conversation_sessions;
begin
  select * into v_s from public.conversation_sessions where id = p_session for update;
  if not found or not public.can_operate(v_s.tenant_id)
     or not (v_s.assigned_to = (select auth.uid()) or public.is_tenant_owner(v_s.tenant_id)) then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  update public.conversation_sessions
     set mode = 'bot', assigned_to = null, handoff_requested_at = null, state = 'idle' where id = p_session;
  perform public.log_audit((select auth.uid()), 'SESSION_RELEASED', 'conversation_sessions', v_s.tenant_id, null, null,
    jsonb_build_object('session_id', p_session));
end;
$$;

-- Permisos de las RPC: las de operador, solo autenticados; las del servidor, solo service role.
revoke execute on function public.advance_order(uuid, public.order_status, text),
  public.review_proof(uuid, text, text), public.claim_session(uuid), public.release_session(uuid),
  public.create_order_from_cart(uuid, public.delivery_mode, text, text, uuid, text),
  public.advance_order_system(uuid, public.order_status, public.sender_type, text) from public, anon, authenticated;
grant execute on function public.advance_order(uuid, public.order_status, text),
  public.review_proof(uuid, text, text), public.claim_session(uuid), public.release_session(uuid) to authenticated;
grant execute on function public.create_order_from_cart(uuid, public.delivery_mode, text, text, uuid, text),
  public.advance_order_system(uuid, public.order_status, public.sender_type, text) to service_role;

-- ───────── RLS: lectura por can_view_operations; sin escritura desde el cliente ─────────
alter table public.customers enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.conversation_sessions enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;
alter table public.payment_proofs enable row level security;
alter table public.messages enable row level security;
alter table public.webhook_events enable row level security;

revoke all on public.customers, public.customer_addresses, public.conversation_sessions, public.carts,
  public.cart_items, public.orders, public.order_items, public.order_status_history, public.payment_proofs,
  public.messages, public.webhook_events from anon, authenticated;
grant select on public.customers, public.customer_addresses, public.conversation_sessions, public.carts,
  public.cart_items, public.orders, public.order_items, public.order_status_history, public.payment_proofs,
  public.messages to authenticated;

create policy customers_select on public.customers for select to authenticated using (public.can_view_operations(tenant_id));
create policy customer_addresses_select on public.customer_addresses for select to authenticated using (public.can_view_operations(tenant_id));
create policy conversation_sessions_select on public.conversation_sessions for select to authenticated using (public.can_view_operations(tenant_id));
create policy carts_select on public.carts for select to authenticated using (public.can_view_operations(tenant_id));
create policy cart_items_select on public.cart_items for select to authenticated using (public.can_view_operations(tenant_id));
create policy orders_select on public.orders for select to authenticated using (public.can_view_operations(tenant_id));
create policy order_items_select on public.order_items for select to authenticated using (public.can_view_operations(tenant_id));
create policy order_status_history_select on public.order_status_history for select to authenticated using (public.can_view_operations(tenant_id));
create policy payment_proofs_select on public.payment_proofs for select to authenticated using (public.can_view_operations(tenant_id));
create policy messages_select on public.messages for select to authenticated using (public.can_view_operations(tenant_id));
-- webhook_events: sin políticas ni grants (solo service role).
