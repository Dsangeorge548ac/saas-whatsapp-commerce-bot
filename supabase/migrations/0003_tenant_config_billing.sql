-- 0003_tenant_config_billing: configuración del comercio, WhatsApp, métodos de pago, suscripción
-- (Stripe), alta de comercio y equipo (invitaciones).
--
-- Regla de negocio (propuesta, sección 9.2): el dueño configura TODO gratis; pagar la suscripción
-- desbloquea invitar operadores, activar el bot y gestionar pedidos/mensajes.
-- Sensibles: tenant_whatsapp_accounts (token en Vault; aquí solo su id), tenant_subscriptions y
-- payments (solo escribe la service role / webhook de Stripe).

-- ───────── Planes (datos, no código) ─────────
create table public.plans (
  id text primary key check (id ~ '^[a-z_]+$'),
  name text not null,
  monthly_price_cents integer not null check (monthly_price_cents >= 0),
  max_users integer check (max_users > 0),                    -- null = ilimitado
  max_orders_per_month integer check (max_orders_per_month > 0), -- null = ilimitado
  stripe_lookup_key text unique,                               -- precio mensual en Stripe (se busca por lookup_key)
  sort_order integer not null default 0,
  is_active boolean not null default true
);
insert into public.plans (id, name, monthly_price_cents, max_users, max_orders_per_month, stripe_lookup_key, sort_order) values
  ('starter',  'Starter',  1900, 2,    300,  'wabot_starter_monthly', 1),
  ('pro',      'Pro',      4900, 5,    1500, 'wabot_pro_monthly',     2),
  ('business', 'Business', 9900, null, null, 'wabot_business_monthly', 3);

-- ───────── Configuración 1:1 del comercio ─────────
create table public.tenant_settings (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  business_type public.business_type not null default 'other',
  timezone text not null default 'UTC' check (char_length(timezone) <= 64),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3,4}$'),
  locale text not null default 'es' check (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  accepts_delivery boolean not null default true,
  accepts_pickup boolean not null default true,
  delivery_fee numeric(14,2) not null default 0 check (delivery_fee >= 0),
  bot_enabled boolean not null default false,    -- solo cambia activate_bot()/pause_bot()
  go_live_at timestamptz,                         -- solo cambia activate_bot()
  messages_reviewed_at timestamptz,               -- paso "Mensajes del bot" del onboarding
  bot_tested_at timestamptz,                      -- paso "Probar el bot" del onboarding
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (accepts_delivery or accepts_pickup)
);
create trigger tenant_settings_updated before update on public.tenant_settings
  for each row execute function public.set_updated_at();

create table public.tenant_branding (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 120),
  logo_path text,                                 -- ruta en Storage, nunca URL
  accent_color text check (accent_color ~ '^#[0-9a-fA-F]{6}$'),
  updated_at timestamptz not null default now()
);
create trigger tenant_branding_updated before update on public.tenant_branding
  for each row execute function public.set_updated_at();

-- Contador por comercio para order_number (evita MAX()+1 y sus condiciones de carrera).
create table public.tenant_counters (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  order_seq integer not null default 0
);

-- ───────── WhatsApp (credenciales por comercio, una sola app de Meta) ─────────
create table public.tenant_whatsapp_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants (id) on delete cascade,
  waba_id text not null check (char_length(waba_id) <= 64),
  phone_number_id text not null unique check (char_length(phone_number_id) <= 64), -- llave de enrutamiento del webhook
  display_phone text check (display_phone ~ '^\+[1-9][0-9]{7,14}$'),
  access_token_secret_id uuid,                    -- referencia a Supabase Vault; el token NUNCA se guarda aquí
  status public.whatsapp_status not null default 'pending',
  last_checked_at timestamptz,
  last_error text check (char_length(last_error) <= 500),
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger tenant_whatsapp_updated before update on public.tenant_whatsapp_accounts
  for each row execute function public.set_updated_at();

-- ───────── Métodos de pago que el bot presenta ─────────
create table public.tenant_payment_methods (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  type public.payment_method_type not null,
  label text not null check (char_length(label) between 2 and 80),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3,4}$'),
  details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(details) = 'object' and char_length(details::text) <= 4000),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tenant_payment_methods_idx on public.tenant_payment_methods (tenant_id, is_active, sort_order);
create trigger tenant_payment_methods_updated before update on public.tenant_payment_methods
  for each row execute function public.set_updated_at();

-- ───────── Suscripción (Stripe es la fuente de verdad) ─────────
create table public.tenant_subscriptions (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  plan_id text not null references public.plans (id),
  status public.subscription_status not null,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  activated_at timestamptz,
  billing_cycle_anchor timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  past_due_since timestamptz,                     -- inicio de la gracia de 7 días
  comp_access_until timestamptz,                  -- cortesía otorgada por la plataforma
  updated_at timestamptz not null default now()
);
create trigger tenant_subscriptions_updated before update on public.tenant_subscriptions
  for each row execute function public.set_updated_at();

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  stripe_invoice_id text not null unique,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  status public.payment_status not null,
  period_start timestamptz,
  period_end timestamptz,
  paid_at timestamptz,
  failure_reason text check (char_length(failure_reason) <= 300),
  hosted_invoice_url text,
  created_at timestamptz not null default now()
);
create index payments_tenant_idx on public.payments (tenant_id, created_at desc);

-- Idempotencia del webhook de Stripe. Sin acceso para usuarios (solo service role).
create table public.stripe_events (
  event_id text primary key,
  type text not null,
  processed_at timestamptz not null default now()
);

-- ───────── Reglas de acceso por suscripción ─────────
-- Facturable = comercio activo y (suscripción activa/trial, cortesía vigente o gracia de 7 días).
create function public.tenant_is_billable(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tenants t
    join public.tenant_subscriptions s on s.tenant_id = t.id
    where t.id = p_tenant and t.status = 'active' and (
      s.comp_access_until > now()
      or s.status in ('active', 'trialing')
      or (s.status = 'past_due' and coalesce(s.past_due_since, now()) > now() - interval '7 days')));
$$;

-- Operar = miembro de un comercio facturable. Ver operación = dueño (siempre, solo lectura) u operar.
create function public.can_operate(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_tenant_member(p_tenant) and public.tenant_is_billable(p_tenant);
$$;
create function public.can_view_operations(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_tenant_owner(p_tenant) or public.can_operate(p_tenant);
$$;

-- ¿Queda cupo de usuarios en el plan? (p_pending: cuenta también invitaciones abiertas).
create function public.tenant_has_user_slot(p_tenant uuid, p_pending boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select p.max_users is null or (
      (select count(*) from public.tenant_members m where m.tenant_id = p_tenant)
      + case when p_pending then (select count(*) from public.tenant_invitations i
          where i.tenant_id = p_tenant and i.accepted_at is null and i.revoked_at is null and i.expires_at > now())
        else 0 end) < p.max_users
    from public.tenant_subscriptions s join public.plans p on p.id = s.plan_id
    where s.tenant_id = p_tenant), false);
$$;

revoke execute on function public.tenant_is_billable(uuid), public.can_operate(uuid),
  public.can_view_operations(uuid), public.tenant_has_user_slot(uuid, boolean) from public, anon;
grant execute on function public.tenant_is_billable(uuid), public.can_operate(uuid),
  public.can_view_operations(uuid), public.tenant_has_user_slot(uuid, boolean) to authenticated, service_role;

-- ───────── RPC: alta de comercio (el dueño se registra y crea el suyo) ─────────
create function public.create_tenant(p_name text, p_business_type public.business_type)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_name, ''));
  v_base text;
  v_slug text;
  v_id uuid;
  v_try integer := 0;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  -- Solo con el correo ya verificado por OTP.
  if not exists (select 1 from auth.users where id = v_uid and email_confirmed_at is not null) then
    raise exception 'Email not verified' using errcode = '42501';
  end if;
  if char_length(v_name) not between 2 and 120 then raise exception 'Invalid business name'; end if;
  -- Límite anti-abuso: máximo 3 comercios propios por usuario.
  if (select count(*) from public.tenant_members where user_id = v_uid and role = 'owner') >= 3 then
    raise exception 'Business limit reached';
  end if;

  v_base := trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'));
  if char_length(v_base) < 3 then v_base := 'shop'; end if;
  v_base := left(v_base, 50);
  v_slug := v_base;
  loop
    begin
      insert into public.tenants (name, slug, created_by) values (v_name, v_slug, v_uid) returning id into v_id;
      exit;
    exception when unique_violation then
      v_try := v_try + 1;
      if v_try > 5 then raise exception 'Could not allocate a unique address'; end if;
      v_slug := v_base || '-' || substr(md5(random()::text), 1, 5);
    end;
  end loop;

  insert into public.tenant_settings (tenant_id, business_type) values (v_id, p_business_type);
  insert into public.tenant_branding (tenant_id, display_name) values (v_id, v_name);
  insert into public.tenant_counters (tenant_id) values (v_id);
  insert into public.tenant_members (tenant_id, user_id, role) values (v_id, v_uid, 'owner');
  perform public.log_audit(v_uid, 'TENANT_CREATED', 'tenants', v_id, null, null,
    jsonb_build_object('business_type', p_business_type));
  return v_id;
end;
$$;

-- ───────── RPC: equipo (invitar, aceptar, quitar, revocar) ─────────
-- Invitar exige: dueño + comercio facturable + cupo en el plan. Devuelve el token UNA sola vez
-- (el servidor lo envía por correo); en la base solo queda su hash SHA-256.
create function public.invite_operator(p_tenant uuid, p_email text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_token text;
begin
  if v_uid is null or not public.is_tenant_owner(p_tenant) then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    raise exception 'Invalid email';
  end if;
  if not public.tenant_is_billable(p_tenant) then raise exception 'SUBSCRIPTION_REQUIRED' using errcode = '42501'; end if;
  if not public.tenant_has_user_slot(p_tenant, true) then raise exception 'USER_LIMIT_REACHED' using errcode = '42501'; end if;
  if exists (select 1 from public.tenant_members m join public.profiles p on p.id = m.user_id
             where m.tenant_id = p_tenant and p.email = v_email) then
    raise exception 'Already a member';
  end if;

  -- Reemplaza una invitación abierta anterior para el mismo correo.
  update public.tenant_invitations set revoked_at = now()
   where tenant_id = p_tenant and email = v_email and accepted_at is null and revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.tenant_invitations (tenant_id, email, token_hash, invited_by, expires_at)
  values (p_tenant, v_email, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_uid, now() + interval '7 days');
  perform public.log_audit(v_uid, 'OPERATOR_INVITED', 'tenant_invitations', p_tenant, null, null, '{}'::jsonb);
  return v_token;
end;
$$;

-- El invitado (con sesión y correo verificado igual al invitado) acepta con el token.
create function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_inv public.tenant_invitations;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  select * into v_inv from public.tenant_invitations
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
   for update;
  -- Mismo error para token inexistente, vencido, usado o de otro correo (no revela cuál).
  if not found or v_inv.accepted_at is not null or v_inv.revoked_at is not null or v_inv.expires_at <= now()
     or not exists (select 1 from public.profiles p join auth.users u on u.id = p.id
                    where p.id = v_uid and p.email = v_inv.email and u.email_confirmed_at is not null) then
    raise exception 'Invalid or expired invitation' using errcode = 'P0002';
  end if;
  if not public.tenant_is_billable(v_inv.tenant_id) then raise exception 'SUBSCRIPTION_REQUIRED' using errcode = '42501'; end if;
  if not public.tenant_has_user_slot(v_inv.tenant_id, false) then raise exception 'USER_LIMIT_REACHED' using errcode = '42501'; end if;

  insert into public.tenant_members (tenant_id, user_id, role, invited_by)
  values (v_inv.tenant_id, v_uid, 'operator', v_inv.invited_by) on conflict do nothing;
  update public.tenant_invitations set accepted_at = now(), accepted_by = v_uid where id = v_inv.id;
  perform public.log_audit(v_uid, 'INVITATION_ACCEPTED', 'tenant_members', v_inv.tenant_id, v_uid, null, '{}'::jsonb);
  return v_inv.tenant_id;
end;
$$;

create function public.revoke_invitation(p_invitation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from public.tenant_invitations where id = p_invitation;
  if v_tenant is null or not public.is_tenant_owner(v_tenant) then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  update public.tenant_invitations set revoked_at = now()
   where id = p_invitation and accepted_at is null and revoked_at is null;
  perform public.log_audit((select auth.uid()), 'INVITATION_REVOKED', 'tenant_invitations', v_tenant, null, null, '{}'::jsonb);
end;
$$;

-- El dueño quita a un operador (nunca a un dueño).
create function public.remove_operator(p_tenant uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_tenant_owner(p_tenant) then raise exception 'Not found' using errcode = 'P0002'; end if;
  delete from public.tenant_members where tenant_id = p_tenant and user_id = p_user and role = 'operator';
  if not found then raise exception 'Not found' using errcode = 'P0002'; end if;
  perform public.log_audit((select auth.uid()), 'OPERATOR_REMOVED', 'tenant_members', p_tenant, p_user, null, '{}'::jsonb);
end;
$$;

revoke execute on function public.create_tenant(text, public.business_type), public.invite_operator(uuid, text),
  public.accept_invitation(text), public.revoke_invitation(uuid), public.remove_operator(uuid, uuid) from public, anon;
grant execute on function public.create_tenant(text, public.business_type), public.invite_operator(uuid, text),
  public.accept_invitation(text), public.revoke_invitation(uuid), public.remove_operator(uuid, uuid) to authenticated;

-- ───────── RLS ─────────
alter table public.plans enable row level security;
alter table public.tenant_settings enable row level security;
alter table public.tenant_branding enable row level security;
alter table public.tenant_counters enable row level security;
alter table public.tenant_whatsapp_accounts enable row level security;
alter table public.tenant_payment_methods enable row level security;
alter table public.tenant_subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.stripe_events enable row level security;

revoke all on public.plans, public.tenant_settings, public.tenant_branding, public.tenant_counters,
  public.tenant_whatsapp_accounts, public.tenant_payment_methods, public.tenant_subscriptions,
  public.payments, public.stripe_events from anon, authenticated;

-- Planes: catálogo de lectura para usuarios autenticados.
grant select on public.plans to authenticated;
create policy plans_select on public.plans for select to authenticated using (true);

-- Ajustes: miembros y staff leen; el dueño edita (sin bot_enabled/go_live_at, que cambian por RPC).
grant select on public.tenant_settings to authenticated;
grant update (business_type, timezone, currency, locale, accepts_delivery, accepts_pickup, delivery_fee,
              messages_reviewed_at, bot_tested_at) on public.tenant_settings to authenticated;
create policy tenant_settings_select on public.tenant_settings for select to authenticated
  using (public.is_tenant_member(tenant_id) or public.is_platform_admin());
create policy tenant_settings_update on public.tenant_settings for update to authenticated
  using (public.is_tenant_owner(tenant_id)) with check (public.is_tenant_owner(tenant_id));

grant select on public.tenant_branding to authenticated;
grant update (display_name, logo_path, accent_color) on public.tenant_branding to authenticated;
create policy tenant_branding_select on public.tenant_branding for select to authenticated
  using (public.is_tenant_member(tenant_id));
create policy tenant_branding_update on public.tenant_branding for update to authenticated
  using (public.is_tenant_owner(tenant_id)) with check (public.is_tenant_owner(tenant_id));

-- tenant_counters: sin políticas ni grants (solo funciones SECURITY DEFINER / service role).

-- WhatsApp: solo el dueño lee (sin la referencia al token). Escribe el servidor (service role + Vault).
grant select (id, tenant_id, waba_id, phone_number_id, display_phone, status, last_checked_at, last_error,
              connected_at, created_at, updated_at) on public.tenant_whatsapp_accounts to authenticated;
create policy tenant_whatsapp_select on public.tenant_whatsapp_accounts for select to authenticated
  using (public.is_tenant_owner(tenant_id));

-- Métodos de pago: miembros leen; el dueño administra (configuración gratuita, no exige suscripción).
grant select, insert, update, delete on public.tenant_payment_methods to authenticated;
create policy tenant_payment_methods_select on public.tenant_payment_methods for select to authenticated
  using (public.is_tenant_member(tenant_id));
create policy tenant_payment_methods_write on public.tenant_payment_methods for all to authenticated
  using (public.is_tenant_owner(tenant_id)) with check (public.is_tenant_owner(tenant_id));

-- Suscripción y pagos: el dueño y el staff de plataforma leen; escribe solo el webhook (service role).
grant select on public.tenant_subscriptions, public.payments to authenticated;
create policy tenant_subscriptions_select on public.tenant_subscriptions for select to authenticated
  using (public.is_tenant_owner(tenant_id) or public.is_platform_admin());
create policy payments_select on public.payments for select to authenticated
  using (public.is_tenant_owner(tenant_id) or public.is_platform_admin());
-- stripe_events: sin políticas ni grants.
