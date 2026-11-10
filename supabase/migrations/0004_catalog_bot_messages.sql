-- 0004_catalog_bot_messages: catálogo, menús conversacionales y mensajes estándar editables.
--
-- Sin datos personales. Lectura: miembros del comercio. Escritura: solo el dueño (el operador no
-- edita catálogo ni menús). El bot lee con la service role desde el webhook.
-- Límites de WhatsApp: título de fila de lista 24 caracteres, descripción 72, máx. 10 filas por lista.

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, name),
  unique (tenant_id, id)                           -- permite FK compuestas que garantizan el mismo comercio
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  category_id uuid,
  name text not null check (char_length(name) between 1 and 120),
  description text check (char_length(description) <= 1000),
  price numeric(14,2) not null check (price >= 0),  -- moneda = tenant_settings.currency
  price_visible boolean not null default true,      -- false: se cotiza con un asesor (p. ej. maquinaria)
  image_path text,                                  -- ruta en Storage, nunca URL pública
  sku text check (char_length(sku) <= 60),
  is_available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  -- Una categoría ajena es imposible: la FK compuesta fuerza el mismo tenant_id.
  -- Si se borra la categoría, el producto queda sin categoría (no se borra el producto).
  foreign key (tenant_id, category_id) references public.categories (tenant_id, id) on delete set null (category_id)
);
create unique index products_sku_idx on public.products (tenant_id, sku) where sku is not null;
create index products_list_idx on public.products (tenant_id, category_id, sort_order) where is_available;
create trigger products_updated before update on public.products
  for each row execute function public.set_updated_at();

-- Menús conversacionales: cada ítem es una fila de lista o un botón (≤3 botones / ≤10 filas).
create table public.bot_menus (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_]+$' and char_length(key) <= 40),   -- 'main' es el menú de entrada
  title text not null check (char_length(title) between 1 and 60),
  body text not null check (char_length(body) between 1 and 1024),
  button_label text not null default 'Ver opciones' check (char_length(button_label) between 1 and 20),
  created_at timestamptz not null default now(),
  unique (tenant_id, key),
  unique (tenant_id, id)
);

create table public.bot_menu_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  menu_id uuid not null,
  title text not null check (char_length(title) between 1 and 24),
  description text check (char_length(description) <= 72),
  action public.menu_action not null,
  target_menu_id uuid,
  category_id uuid,
  product_id uuid,
  sort_order integer not null default 0,
  foreign key (tenant_id, menu_id) references public.bot_menus (tenant_id, id) on delete cascade,
  foreign key (tenant_id, target_menu_id) references public.bot_menus (tenant_id, id) on delete cascade,
  foreign key (tenant_id, category_id) references public.categories (tenant_id, id) on delete cascade,
  foreign key (tenant_id, product_id) references public.products (tenant_id, id) on delete cascade,
  -- La acción exige su destino; las demás no llevan destino.
  check (
    (action = 'submenu' and target_menu_id is not null) or
    (action = 'show_category' and category_id is not null) or
    (action = 'show_product' and product_id is not null) or
    (action in ('business_info', 'request_agent', 'start_order')))
);
create index bot_menu_items_menu_idx on public.bot_menu_items (menu_id, sort_order);

-- Máximo 10 ítems por menú (límite de las listas interactivas de WhatsApp).
create function public.check_menu_item_limit() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.bot_menu_items where menu_id = new.menu_id and id <> new.id) >= 10 then
    raise exception 'A menu can have at most 10 items';
  end if;
  return new;
end;
$$;
create trigger bot_menu_items_limit before insert or update of menu_id on public.bot_menu_items
  for each row execute function public.check_menu_item_limit();

-- ───────── Mensajes estándar (plataforma) y personalizados (comercio) ─────────
create table public.message_template_defaults (
  id uuid primary key default gen_random_uuid(),
  key text not null check (key ~ '^[a-z_]+$'),
  business_type text not null default 'all' check (business_type in ('all', 'restaurant', 'bakery', 'products', 'other')),
  locale text not null default 'es',
  stage text not null,                               -- agrupa en la UI: welcome, menu, cart, address, payment, order, agent
  description text not null,                         -- qué hace y cuándo se envía (ayuda en contexto)
  body text not null check (char_length(body) <= 1000),
  allowed_placeholders text[] not null default '{}',
  required_placeholders text[] not null default '{}',
  sort_order integer not null default 0,
  unique (key, business_type, locale)
);

create table public.tenant_messages (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  key text not null,
  body text not null check (char_length(body) between 1 and 1000),
  is_enabled boolean not null default true,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, key)
);

-- Valida el texto: la clave debe existir, solo placeholders permitidos y los obligatorios presentes.
-- (El texto es plano: nunca se interpreta como HTML ni como código.)
create function public.validate_tenant_message() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_allowed text[];
  v_required text[];
  v_used text[];
begin
  select allowed_placeholders, required_placeholders into v_allowed, v_required
    from public.message_template_defaults where key = new.key
    order by (business_type = 'all') desc limit 1;
  if not found then raise exception 'Unknown message key: %', new.key; end if;

  select coalesce(array_agg(distinct t.x[1]), '{}') into v_used
    from regexp_matches(new.body, '\{([a-z_]+)\}', 'g') as t(x);
  if exists (select 1 from unnest(v_used) u where u <> all (v_allowed)) then
    raise exception 'Message uses a placeholder that is not allowed here (allowed: %)', array_to_string(v_allowed, ', ');
  end if;
  if exists (select 1 from unnest(v_required) r where r <> all (v_used)) then
    raise exception 'Message must include: %', array_to_string(v_required, ', ');
  end if;
  new.updated_at = now();
  return new;
end;
$$;
create trigger tenant_messages_validate before insert or update on public.tenant_messages
  for each row execute function public.validate_tenant_message();

-- Textos por defecto (español). Los comercios pueden editarlos; si no, el bot usa estos.
insert into public.message_template_defaults (key, business_type, stage, description, body, allowed_placeholders, required_placeholders, sort_order) values
 ('welcome','all','welcome','Primer mensaje cuando un cliente escribe.',
  E'¡Hola {customer_name}! 👋 Bienvenido a {business_name}. ¿En qué podemos ayudarte hoy?','{customer_name,business_name}','{}',10),
 ('welcome','restaurant','welcome','Primer mensaje cuando un cliente escribe.',
  E'¡Hola {customer_name}! 🍽️ Bienvenido a {business_name}. Mira nuestro menú y haz tu pedido en pocos pasos.','{customer_name,business_name}','{}',10),
 ('welcome','bakery','welcome','Primer mensaje cuando un cliente escribe.',
  E'¡Hola {customer_name}! 🥐 Bienvenido a {business_name}. Elige tus productos recién horneados y haz tu pedido aquí.','{customer_name,business_name}','{}',10),
 ('welcome','products','welcome','Primer mensaje cuando un cliente escribe.',
  E'Hola {customer_name}, bienvenido a {business_name}. Explora nuestro catálogo o pide hablar con un asesor.','{customer_name,business_name}','{}',10),
 ('menu_prompt','all','menu','Texto que acompaña al menú principal.',
  'Elige una opción para continuar:','{business_name}','{}',20),
 ('catalog_prompt','all','menu','Texto antes de mostrar los productos.',
  'Estos son nuestros productos. Elige uno para ver el detalle.','{business_name}','{}',30),
 ('business_info','all','menu','Respuesta a "Información del negocio". Complétala con tus datos.',
  E'Somos {business_name}.\nHorario: [escribe tu horario]\nDirección: [escribe tu dirección]','{business_name}','{}',40),
 ('cart_summary','all','cart','Resumen del carrito antes de pedir la confirmación.',
  E'Tu pedido:\n{items}\n\nTotal: {total}\n\n¿Confirmas tu pedido?','{items,total}','{items,total}',50),
 ('ask_fulfillment','all','address','Pregunta si es entrega a domicilio o retiro.',
  '¿Cómo prefieres recibir tu pedido?','{}','{}',60),
 ('ask_address','all','address','Pide la dirección de entrega.',
  'Escribe la dirección de entrega (calle, número y una referencia).','{}','{}',70),
 ('ask_notes','all','address','Pide notas para el pedido.',
  E'¿Quieres agregar alguna nota para tu pedido? Si no, responde "No".','{}','{}',80),
 ('payment_instructions','all','payment','Datos para pagar. Debe incluir los datos de pago y el total.',
  E'Pedido #{order_number} — Total: {total}.\n\nDatos para pagar:\n{payment_details}\n\nCuando pagues, envía la captura o el número de referencia.','{order_number,total,payment_details}','{total,payment_details}',90),
 ('ask_proof','all','payment','Recordatorio cuando falta el comprobante.',
  'Estamos esperando tu comprobante de pago. Envía una captura o el número de referencia.','{order_number}','{}',100),
 ('proof_received','all','payment','Confirma que recibimos el comprobante.',
  '¡Recibimos tu comprobante del pedido #{order_number}! Lo estamos validando y te avisamos en breve.','{order_number}','{}',110),
 ('proof_rejected','all','payment','Cuando el comprobante no se pudo validar.',
  'No pudimos validar tu comprobante del pedido #{order_number}. {reason}. Por favor envíalo de nuevo.','{order_number,reason}','{}',120),
 ('order_approved','all','order','Cuando el pago fue aprobado y empieza la preparación.',
  '✅ Tu pedido #{order_number} fue aprobado y ya lo estamos preparando.','{order_number}','{}',130),
 ('order_on_the_way','all','order','Cuando el repartidor sale con el pedido.',
  '🛵 Tu pedido #{order_number} va en camino.','{order_number}','{}',140),
 ('confirm_delivery_prompt','all','order','Pide al cliente confirmar que recibió el pedido.',
  '¿Ya recibiste tu pedido #{order_number}?','{order_number}','{}',150),
 ('order_delivered','all','order','Cierre del pedido.',
  '¡Gracias por tu compra en {business_name}! Esperamos verte pronto.','{order_number,business_name}','{}',160),
 ('handoff_to_agent','all','agent','Cuando el cliente pide un asesor.',
  'Un asesor te atenderá en breve. Gracias por tu paciencia.','{}','{}',170),
 ('out_of_hours','all','agent','Fuera de horario. Complétala con tu horario.',
  E'Ahora mismo estamos fuera de horario. Horario: [escribe tu horario]','{business_name}','{}',180),
 ('shop_paused','all','agent','Cuando el comercio no está tomando pedidos (bot pausado o sin suscripción).',
  'Por el momento no estamos tomando pedidos por este medio. ¡Vuelve pronto!','{business_name}','{}',190);

-- ───────── RLS ─────────
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.bot_menus enable row level security;
alter table public.bot_menu_items enable row level security;
alter table public.message_template_defaults enable row level security;
alter table public.tenant_messages enable row level security;

revoke all on public.categories, public.products, public.bot_menus, public.bot_menu_items,
  public.message_template_defaults, public.tenant_messages from anon, authenticated;

-- Catálogo, menús y mensajes: leen los miembros; escribe el dueño.
grant select, insert, update, delete on public.categories, public.products, public.bot_menus,
  public.bot_menu_items, public.tenant_messages to authenticated;

create policy categories_select on public.categories for select to authenticated using (public.is_tenant_member(tenant_id));
create policy categories_write on public.categories for all to authenticated
  using (public.is_tenant_owner(tenant_id)) with check (public.is_tenant_owner(tenant_id));
create policy products_select on public.products for select to authenticated using (public.is_tenant_member(tenant_id));
create policy products_write on public.products for all to authenticated
  using (public.is_tenant_owner(tenant_id)) with check (public.is_tenant_owner(tenant_id));
create policy bot_menus_select on public.bot_menus for select to authenticated using (public.is_tenant_member(tenant_id));
create policy bot_menus_write on public.bot_menus for all to authenticated
  using (public.is_tenant_owner(tenant_id)) with check (public.is_tenant_owner(tenant_id));
create policy bot_menu_items_select on public.bot_menu_items for select to authenticated using (public.is_tenant_member(tenant_id));
create policy bot_menu_items_write on public.bot_menu_items for all to authenticated
  using (public.is_tenant_owner(tenant_id)) with check (public.is_tenant_owner(tenant_id));
create policy tenant_messages_select on public.tenant_messages for select to authenticated using (public.is_tenant_member(tenant_id));
create policy tenant_messages_write on public.tenant_messages for all to authenticated
  using (public.is_tenant_owner(tenant_id)) with check (public.is_tenant_owner(tenant_id));

-- Textos por defecto: catálogo de solo lectura.
grant select on public.message_template_defaults to authenticated;
create policy message_template_defaults_select on public.message_template_defaults for select to authenticated using (true);
