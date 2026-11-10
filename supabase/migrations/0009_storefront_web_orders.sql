-- 0009_storefront_web_orders: ciclo de pedido con `awaiting_payment`, publicaciones de catálogo,
-- tienda pública (empresa.dominio) y pedido desde la web vinculado a la conversación de WhatsApp.
--
-- Datos públicos: solo vía funciones SECURITY DEFINER de lectura con campos fijos (anon NO tiene
-- permisos sobre las tablas). Sensible: web_order_links (solo se guarda el hash del token).

-- ───────── Ciclo del pedido ─────────
-- awaiting_payment → pending (comprobante recibido) → approved → on_the_way → delivered.
-- Cancelar: desde awaiting_payment, pending o approved, siempre con motivo.
alter table public.orders alter column status set default 'awaiting_payment';

create or replace function public.guard_order_update() returns trigger
language plpgsql set search_path = '' as $$
declare v_reason text := coalesce(current_setting('app.status_reason', true), '');
begin
  if (to_jsonb(new) - 'status' - 'updated_at') <> (to_jsonb(old) - 'status' - 'updated_at') then
    raise exception 'Order data is immutable; only the status can change' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if not ((old.status = 'awaiting_payment' and new.status in ('pending', 'cancelled'))
         or (old.status = 'pending' and new.status in ('approved', 'cancelled'))
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

-- Bandeja "Sin pagar" (no aparece en el Kanban).
create index orders_unpaid_idx on public.orders (tenant_id, placed_at desc) where status = 'awaiting_payment';

-- "Nuevo pedido" se notifica cuando el pedido entra en `pending` (ya pagó), no al crearse.
drop trigger orders_notify on public.orders;
create trigger orders_notify_pending after update of status on public.orders
  for each row when (new.status = 'pending' and old.status is distinct from new.status)
  execute function public.trg_notify_order();

-- Llega un comprobante: si el pedido esperaba pago pasa a `pending` (actor: cliente); si ya estaba en
-- revisión (reenvío tras un rechazo) solo se avisa. En cualquier otro estado se rechaza.
drop trigger payment_proofs_notify on public.payment_proofs;
create function public.trg_proof_received() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_status public.order_status;
begin
  select status into v_status from public.orders where id = new.order_id;
  if v_status = 'awaiting_payment' then
    perform set_config('app.actor_type', 'customer', true);
    perform set_config('app.status_reason', 'Payment proof received', true);
    update public.orders set status = 'pending' where id = new.order_id;
  elsif v_status = 'pending' then
    perform public.notify_tenant_members(new.tenant_id, 'proof_submitted', 'Payment proof to review', '/orders');
  else
    raise exception 'Order is not awaiting payment';
  end if;
  return new;
end;
$$;
revoke execute on function public.trg_proof_received() from public, anon, authenticated;
create trigger payment_proofs_received after insert on public.payment_proofs
  for each row execute function public.trg_proof_received();

-- Vencimiento: cancela los pedidos sin pagar tras N horas (lo invoca un job; solo service role).
create function public.expire_unpaid_orders(p_hours integer default 24) returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0;
begin
  for r in select id from public.orders
            where status = 'awaiting_payment' and placed_at < now() - make_interval(hours => p_hours)
            for update skip locked loop
    perform set_config('app.actor_type', 'system', true);
    perform set_config('app.status_reason', 'Payment timeout', true);
    update public.orders set status = 'cancelled' where id = r.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function public.expire_unpaid_orders(integer) from public, anon, authenticated;
grant execute on function public.expire_unpaid_orders(integer) to service_role;

-- ───────── Subdominios reservados ─────────
-- create_tenant reintenta con sufijo ante unique_violation, así que un slug reservado se resuelve solo.
create function public.reject_reserved_slug() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.slug::text = any (array['www','app','api','admin','mail','email','static','assets','cdn','dashboard',
      'login','register','support','help','docs','status','blog','auth','billing','webhooks','ftp','smtp','staging','dev','test']) then
    raise exception 'Reserved address' using errcode = '23505';
  end if;
  return new;
end;
$$;
create trigger tenants_reserved_slug before insert or update of slug on public.tenants
  for each row execute function public.reject_reserved_slug();

-- ───────── Publicaciones de catálogo ─────────
create table public.catalog_publications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text check (char_length(description) <= 500),
  cover_path text,                                  -- ruta en el bucket product-images
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);
create index catalog_publications_idx on public.catalog_publications (tenant_id, status, published_at desc);
create trigger catalog_publications_updated before update on public.catalog_publications
  for each row execute function public.set_updated_at();

create table public.catalog_publication_items (
  publication_id uuid not null,
  product_id uuid not null,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  sort_order integer not null default 0,
  primary key (publication_id, product_id),
  foreign key (tenant_id, publication_id) references public.catalog_publications (tenant_id, id) on delete cascade,
  foreign key (tenant_id, product_id) references public.products (tenant_id, id) on delete cascade
);
create index catalog_publication_items_product_idx on public.catalog_publication_items (product_id);

-- Máximo 60 productos por publicación.
create function public.check_publication_item_limit() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.catalog_publication_items where publication_id = new.publication_id) >= 60 then
    raise exception 'A publication can have at most 60 products';
  end if;
  return new;
end;
$$;
create trigger catalog_publication_items_limit before insert on public.catalog_publication_items
  for each row execute function public.check_publication_item_limit();

-- Publicar exige al menos un producto; fija la fecha de publicación.
create function public.check_publication_publish() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'published' then
    if not exists (select 1 from public.catalog_publication_items where publication_id = new.id) then
      raise exception 'A publication needs at least one product';
    end if;
    new.published_at = coalesce(old.published_at, now());
  end if;
  return new;
end;
$$;
create trigger catalog_publications_publish before update of status on public.catalog_publications
  for each row when (new.status = 'published' and old.status is distinct from 'published')
  execute function public.check_publication_publish();

-- Con publicaciones creadas, la dirección (slug) no cambia: se romperían los enlaces compartidos.
create function public.guard_slug_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.catalog_publications where tenant_id = old.id) then
    raise exception 'The address cannot change after publishing';
  end if;
  return new;
end;
$$;
create trigger tenants_slug_guard before update of slug on public.tenants
  for each row when (new.slug is distinct from old.slug) execute function public.guard_slug_change();

alter table public.catalog_publications enable row level security;
alter table public.catalog_publication_items enable row level security;
revoke all on public.catalog_publications, public.catalog_publication_items from anon, authenticated;
grant select, insert, update, delete on public.catalog_publications, public.catalog_publication_items to authenticated;
create policy catalog_publications_select on public.catalog_publications for select to authenticated
  using (public.is_tenant_member(tenant_id));
create policy catalog_publications_write on public.catalog_publications for all to authenticated
  using (public.is_tenant_owner(tenant_id)) with check (public.is_tenant_owner(tenant_id));
create policy catalog_publication_items_select on public.catalog_publication_items for select to authenticated
  using (public.is_tenant_member(tenant_id));
create policy catalog_publication_items_write on public.catalog_publication_items for all to authenticated
  using (public.is_tenant_owner(tenant_id)) with check (public.is_tenant_owner(tenant_id));

-- ───────── Enlaces personales de pedido web (un solo uso) ─────────
create table public.web_order_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  session_id uuid not null,
  publication_id uuid,
  token_hash text not null unique,                  -- SHA-256; el token solo viaja por el chat
  expires_at timestamptz not null,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, session_id) references public.conversation_sessions (tenant_id, id) on delete cascade,
  foreign key (tenant_id, publication_id) references public.catalog_publications (tenant_id, id) on delete set null (publication_id)
);
create index web_order_links_session_idx on public.web_order_links (session_id);
alter table public.web_order_links enable row level security;
revoke all on public.web_order_links from anon, authenticated;     -- solo service role

-- El bot genera el enlace (service role). Invalida los anteriores sin usar de la misma sesión.
create function public.create_web_order_link(p_session uuid, p_publication uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_s public.conversation_sessions; v_token text;
begin
  select * into v_s from public.conversation_sessions where id = p_session and closed_at is null;
  if not found then raise exception 'SESSION_CLOSED'; end if;
  if not exists (select 1 from public.catalog_publications
                 where id = p_publication and tenant_id = v_s.tenant_id and status = 'published') then
    raise exception 'PUBLICATION_NOT_FOUND';
  end if;
  update public.web_order_links set expires_at = now()
   where session_id = p_session and submitted_at is null and expires_at > now();
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.web_order_links (tenant_id, session_id, publication_id, token_hash, expires_at)
  values (v_s.tenant_id, p_session, p_publication, encode(extensions.digest(v_token, 'sha256'), 'hex'),
          now() + interval '24 hours');
  return v_token;
end;
$$;

-- Envío del pedido desde la web (lo llama el Server Action con service role tras validar con Zod y
-- limitar intentos). Re-precia en el servidor, reemplaza el carrito y deja la conversación esperando
-- confirmación. La identidad del cliente sale de la sesión de WhatsApp, no de la web.
create function public.submit_web_order(p_token text, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_link public.web_order_links;
  v_s public.conversation_sessions;
  v_set public.tenant_settings;
  v_cart uuid;
  v_n integer;
  v_found integer;
  v_total integer;
  v_subtotal numeric(14,2);
begin
  select * into v_link from public.web_order_links
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') for update;
  if not found or v_link.submitted_at is not null or v_link.expires_at <= now() then
    raise exception 'LINK_INVALID';
  end if;
  if not public.tenant_is_billable(v_link.tenant_id) then raise exception 'TENANT_NOT_BILLABLE'; end if;
  select * into v_set from public.tenant_settings where tenant_id = v_link.tenant_id;
  if not v_set.bot_enabled then raise exception 'BOT_DISABLED'; end if;

  select * into v_s from public.conversation_sessions where id = v_link.session_id for update;
  if v_s.closed_at is not null then raise exception 'SESSION_CLOSED'; end if;
  if v_s.mode = 'human' then raise exception 'SESSION_WITH_AGENT'; end if;

  if jsonb_typeof(p_items) <> 'array' then raise exception 'ITEMS_INVALID'; end if;
  v_n := jsonb_array_length(p_items);
  if v_n < 1 or v_n > 60 then raise exception 'ITEMS_INVALID'; end if;

  -- Cantidades por producto (suma duplicados) y validación de pertenencia, disponibilidad y precio visible.
  if exists (with items as (select sum((i ->> 'quantity')::integer) as q from jsonb_array_elements(p_items) i
                              group by i ->> 'product_id')
             select 1 from items where q < 1 or q > 999) then
    raise exception 'ITEMS_INVALID';
  end if;
  select count(*) into v_total from (select 1 from jsonb_array_elements(p_items) i group by i ->> 'product_id') x;
  with items as (select (i ->> 'product_id')::uuid as pid from jsonb_array_elements(p_items) i group by 1)
  select count(*) into v_found from items w
    join public.catalog_publication_items pi on pi.product_id = w.pid and pi.publication_id = v_link.publication_id
    join public.products p on p.id = w.pid and p.tenant_id = v_link.tenant_id
   where p.is_available and p.price_visible;
  if v_found <> v_total then raise exception 'PRODUCT_UNAVAILABLE'; end if;

  select id into v_cart from public.carts where session_id = v_s.id for update;
  if v_cart is null then
    insert into public.carts (tenant_id, session_id) values (v_s.tenant_id, v_s.id) returning id into v_cart;
  elsif (select status from public.carts where id = v_cart) = 'converted' then
    raise exception 'SESSION_COMPLETED';
  else
    update public.carts set status = 'active' where id = v_cart;
    delete from public.cart_items where cart_id = v_cart;
  end if;
  with items as (select (i ->> 'product_id')::uuid as pid, sum((i ->> 'quantity')::integer) as q
                   from jsonb_array_elements(p_items) i group by 1)
  insert into public.cart_items (tenant_id, cart_id, product_id, quantity, unit_price_snapshot)
  select v_s.tenant_id, v_cart, w.pid, w.q, p.price from items w join public.products p on p.id = w.pid;

  -- FSM: pasa por browsing_menu (destino universal) hasta awaiting_cart_confirmation.
  update public.conversation_sessions set state = 'browsing_menu' where id = v_s.id;
  update public.conversation_sessions set state = 'building_cart' where id = v_s.id;
  update public.conversation_sessions set state = 'awaiting_cart_confirmation' where id = v_s.id;
  update public.web_order_links set submitted_at = now() where id = v_link.id;

  select coalesce(sum(ci.quantity * ci.unit_price_snapshot), 0) into v_subtotal from public.cart_items ci where ci.cart_id = v_cart;
  return jsonb_build_object('tenant_id', v_s.tenant_id, 'session_id', v_s.id, 'cart_id', v_cart,
    'currency', v_set.currency, 'subtotal', v_subtotal,
    'items', (select jsonb_agg(jsonb_build_object('name', p.name, 'quantity', ci.quantity,
                'unit_price', ci.unit_price_snapshot, 'line_total', ci.quantity * ci.unit_price_snapshot) order by p.name)
                from public.cart_items ci join public.products p on p.id = ci.product_id where ci.cart_id = v_cart));
end;
$$;
revoke execute on function public.create_web_order_link(uuid, uuid), public.submit_web_order(text, jsonb) from public, anon, authenticated;
grant execute on function public.create_web_order_link(uuid, uuid), public.submit_web_order(text, jsonb) to service_role;

-- ───────── Lectura pública (sin sesión): campos fijos, solo publicado y de comercios facturables ─────────
create function public.get_public_storefront(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t public.tenants;
begin
  select * into t from public.tenants where slug = lower(coalesce(p_slug, ''))::extensions.citext;
  if not found or t.status <> 'active' then return null; end if;
  if not public.tenant_is_billable(t.id) then
    return jsonb_build_object('available', false,
      'business', (select jsonb_build_object('name', b.display_name) from public.tenant_branding b where b.tenant_id = t.id));
  end if;
  return jsonb_build_object('available', true,
    'business', (select jsonb_build_object('name', b.display_name, 'accent_color', b.accent_color,
        'currency', s.currency,
        'whatsapp', (select regexp_replace(w.display_phone, '\D', '', 'g') from public.tenant_whatsapp_accounts w
                      where w.tenant_id = t.id and w.status = 'connected'))
      from public.tenant_branding b join public.tenant_settings s on s.tenant_id = b.tenant_id where b.tenant_id = t.id),
    'publications', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'description', p.description,
        'has_cover', p.cover_path is not null,
        'item_count', (select count(*) from public.catalog_publication_items i where i.publication_id = p.id))
        order by p.published_at desc)
      from public.catalog_publications p where p.tenant_id = t.id and p.status = 'published'), '[]'::jsonb));
end;
$$;

create function public.get_public_publication(p_slug text, p_publication uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t public.tenants; p public.catalog_publications;
begin
  select * into t from public.tenants where slug = lower(coalesce(p_slug, ''))::extensions.citext;
  if not found or t.status <> 'active' then return null; end if;
  if not public.tenant_is_billable(t.id) then
    return jsonb_build_object('available', false,
      'business', (select jsonb_build_object('name', b.display_name) from public.tenant_branding b where b.tenant_id = t.id));
  end if;
  select * into p from public.catalog_publications where id = p_publication and tenant_id = t.id and status = 'published';
  if not found then return null; end if;
  return jsonb_build_object('available', true,
    'business', (select jsonb_build_object('name', b.display_name, 'accent_color', b.accent_color, 'currency', s.currency,
        'whatsapp', (select regexp_replace(w.display_phone, '\D', '', 'g') from public.tenant_whatsapp_accounts w
                      where w.tenant_id = t.id and w.status = 'connected'))
      from public.tenant_branding b join public.tenant_settings s on s.tenant_id = b.tenant_id where b.tenant_id = t.id),
    'publication', jsonb_build_object('id', p.id, 'title', p.title, 'description', p.description, 'has_cover', p.cover_path is not null),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', pr.id, 'name', pr.name, 'description', pr.description,
        'price', case when pr.price_visible then pr.price end, 'price_visible', pr.price_visible,
        'has_image', pr.image_path is not null) order by i.sort_order, pr.name)
      from public.catalog_publication_items i join public.products pr on pr.id = i.product_id and pr.tenant_id = t.id
      where i.publication_id = p.id and pr.is_available), '[]'::jsonb));
end;
$$;

-- Ruta de la foto de un producto, SOLO si está en una publicación publicada de un comercio facturable.
-- La usa /api/public-files (service role); la foto es la única excepción a "archivos privados".
create function public.get_public_product_image(p_product uuid) returns text
language sql stable security definer set search_path = '' as $$
  select pr.image_path from public.products pr
   where pr.id = p_product and pr.image_path is not null and pr.is_available
     and public.tenant_is_billable(pr.tenant_id)
     and exists (select 1 from public.catalog_publication_items i
                 join public.catalog_publications p on p.id = i.publication_id
                 where i.product_id = pr.id and p.status = 'published');
$$;
create function public.get_public_cover_image(p_publication uuid) returns text
language sql stable security definer set search_path = '' as $$
  select p.cover_path from public.catalog_publications p
   where p.id = p_publication and p.status = 'published' and p.cover_path is not null
     and public.tenant_is_billable(p.tenant_id);
$$;

revoke execute on function public.get_public_storefront(text), public.get_public_publication(text, uuid),
  public.get_public_product_image(uuid), public.get_public_cover_image(uuid) from public;
grant execute on function public.get_public_storefront(text), public.get_public_publication(text, uuid) to anon, authenticated, service_role;
grant execute on function public.get_public_product_image(uuid), public.get_public_cover_image(uuid) to service_role;
