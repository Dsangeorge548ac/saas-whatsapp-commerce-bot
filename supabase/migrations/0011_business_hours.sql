-- 0011_business_hours: horario de atención por día de la semana.
--
-- El comercio define si atiende de lunes a domingo (o qué días) y desde/hasta qué hora. Fuera de
-- horario el bot responde con el mensaje `out_of_hours` (con apertura y cierre) y no se toman pedidos.
-- Sin horario configurado (hours_enabled = false) el comercio se considera abierto 24 horas.
-- Un turno puede cruzar la medianoche (p. ej. viernes 18:00–02:00). Todo se evalúa en la zona
-- horaria del comercio (tenant_settings.timezone). Sin datos personales.

alter table public.tenant_settings add column hours_enabled boolean not null default false;

-- Un día por fila. weekday sigue ISO: 1 = lunes … 7 = domingo.
create table public.tenant_business_hours (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  is_open boolean not null default true,
  opens_at time,
  closes_at time,                                   -- si es menor que opens_at, el turno cruza la medianoche
  primary key (tenant_id, weekday),
  check ((is_open and opens_at is not null and closes_at is not null and opens_at <> closes_at)
         or (not is_open and opens_at is null and closes_at is null))
);

-- La zona horaria debe existir (nombre IANA, p. ej. America/Caracas).
create function public.validate_tenant_timezone() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Invalid time zone: %', new.timezone;
  end if;
  return new;
end;
$$;
create trigger tenant_settings_timezone before insert or update of timezone on public.tenant_settings
  for each row execute function public.validate_tenant_timezone();

-- Guarda los 7 días de una vez (atómico) y activa/desactiva el horario. Solo el dueño.
-- p_days: [{"weekday":1,"is_open":true,"opens_at":"09:00","closes_at":"18:00"}, ... 7 elementos]
create function public.set_business_hours(p_tenant uuid, p_enabled boolean, p_days jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  d jsonb;
  v_wd integer;
  v_open boolean;
  v_seen integer[] := '{}';
begin
  if not public.is_tenant_owner(p_tenant) then raise exception 'Not found' using errcode = 'P0002'; end if;
  if jsonb_typeof(p_days) <> 'array' or jsonb_array_length(p_days) <> 7 then raise exception 'HOURS_INVALID'; end if;

  delete from public.tenant_business_hours where tenant_id = p_tenant;
  for d in select * from jsonb_array_elements(p_days) loop
    v_wd := (d ->> 'weekday')::integer;
    if v_wd is null or v_wd not between 1 and 7 or v_wd = any (v_seen) then raise exception 'HOURS_INVALID'; end if;
    v_seen := v_seen || v_wd;
    v_open := coalesce((d ->> 'is_open')::boolean, false);
    insert into public.tenant_business_hours (tenant_id, weekday, is_open, opens_at, closes_at)
    values (p_tenant, v_wd, v_open,
            case when v_open then (d ->> 'opens_at')::time end,
            case when v_open then (d ->> 'closes_at')::time end);
  end loop;
  if p_enabled and not exists (select 1 from public.tenant_business_hours where tenant_id = p_tenant and is_open) then
    raise exception 'HOURS_INVALID';                -- activar un horario sin ningún día abierto no tiene sentido
  end if;
  update public.tenant_settings set hours_enabled = p_enabled where tenant_id = p_tenant;
  perform public.log_audit((select auth.uid()), 'BUSINESS_HOURS_UPDATED', 'tenant_business_hours', p_tenant, null, null,
    jsonb_build_object('enabled', p_enabled));
end;
$$;

-- Estado de apertura en un instante (por defecto, ahora). Lo usa el bot (service role) y el panel
-- (miembros). Devuelve datos estructurados: el texto ("abre a las 9:00") lo arma la app según el idioma.
create function public.get_open_status(p_tenant uuid, p_at timestamptz default now()) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.tenant_settings;
  h public.tenant_business_hours;
  y public.tenant_business_hours;
  v_local timestamp;
  v_dow integer;
  v_time time;
  v_open boolean := false;
  v_cur_close time;
  v_next timestamp;
  v_next_dow integer;
  v_opens time;
  v_closes time;
  i integer;
  v_cand timestamp;
begin
  if (select auth.uid()) is not null and not public.is_tenant_member(p_tenant) then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  select * into s from public.tenant_settings where tenant_id = p_tenant;
  if not found then raise exception 'Not found' using errcode = 'P0002'; end if;
  if not s.hours_enabled then
    return jsonb_build_object('hours_enabled', false, 'is_open', true, 'timezone', s.timezone);
  end if;

  v_local := p_at at time zone s.timezone;
  v_dow := extract(isodow from v_local)::integer;
  v_time := v_local::time;
  select * into h from public.tenant_business_hours where tenant_id = p_tenant and weekday = v_dow;
  select * into y from public.tenant_business_hours where tenant_id = p_tenant and weekday = case when v_dow = 1 then 7 else v_dow - 1 end;

  if h.is_open then
    if h.opens_at < h.closes_at then v_open := v_time >= h.opens_at and v_time < h.closes_at;
    else v_open := v_time >= h.opens_at; end if;     -- turno nocturno: abre hoy y cierra mañana
    if v_open then v_cur_close := h.closes_at; end if;
  end if;
  -- El turno nocturno de ayer sigue abierto hasta su hora de cierre.
  if not v_open and y.is_open and y.closes_at < y.opens_at and v_time < y.closes_at then
    v_open := true; v_cur_close := y.closes_at;
  end if;

  if not v_open then
    for i in 0..7 loop
      select * into h from public.tenant_business_hours
       where tenant_id = p_tenant and weekday = ((v_dow - 1 + i) % 7) + 1;
      if h.is_open then
        v_cand := (v_local::date + i) + h.opens_at;
        if v_cand > v_local then
          v_next := v_cand; v_next_dow := h.weekday; v_opens := h.opens_at; v_closes := h.closes_at;
          exit;
        end if;
      end if;
    end loop;
  end if;

  return jsonb_build_object('hours_enabled', true, 'is_open', v_open, 'timezone', s.timezone,
    'closes_at', to_char(v_cur_close, 'HH24:MI'),            -- cuándo cierra si está abierto
    'next_open_at', case when v_next is not null then v_next at time zone s.timezone end,
    'next_open_local', to_char(v_next, 'YYYY-MM-DD"T"HH24:MI'),
    'next_open_weekday', v_next_dow,
    'next_opens_at', to_char(v_opens, 'HH24:MI'),
    'next_closes_at', to_char(v_closes, 'HH24:MI'));
end;
$$;

create function public.tenant_is_open_now(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((public.get_open_status(p_tenant) ->> 'is_open')::boolean, true);
$$;

-- No se toman pedidos con el comercio cerrado (ni al crear el pedido ni al enviar el pedido web).
create function public.check_open_hours() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not public.tenant_is_open_now(new.tenant_id) then raise exception 'OUTSIDE_HOURS'; end if;
  return new;
end;
$$;
create trigger orders_open_hours before insert on public.orders
  for each row execute function public.check_open_hours();
create trigger web_order_links_open_hours before update of submitted_at on public.web_order_links
  for each row when (new.submitted_at is not null and old.submitted_at is null)
  execute function public.check_open_hours();

revoke execute on function public.set_business_hours(uuid, boolean, jsonb), public.get_open_status(uuid, timestamptz),
  public.tenant_is_open_now(uuid) from public, anon;
grant execute on function public.set_business_hours(uuid, boolean, jsonb) to authenticated;
grant execute on function public.get_open_status(uuid, timestamptz) to authenticated, service_role;
grant execute on function public.tenant_is_open_now(uuid) to authenticated, service_role;

alter table public.tenant_business_hours enable row level security;
revoke all on public.tenant_business_hours from anon, authenticated;
grant select on public.tenant_business_hours to authenticated;     -- escribe solo set_business_hours()
create policy tenant_business_hours_select on public.tenant_business_hours for select to authenticated
  using (public.is_tenant_member(tenant_id));

-- ───────── Mensajes estándar con el horario ─────────
-- {schedule}: resumen semanal ("Lun–Sáb 09:00–18:00"); {next_open}: próxima apertura ("mañana a las 09:00");
-- {opening_time}/{closing_time}: horas de la próxima jornada. Los arma la app según el idioma.
update public.message_template_defaults
   set body = E'Ahora mismo estamos cerrados. 🕒 Nuestro horario: {schedule}.\nVolvemos a atender {next_open}.',
       allowed_placeholders = '{business_name,schedule,next_open,opening_time,closing_time}',
       description = 'Cuando un cliente escribe fuera del horario de atención. Indica cuándo abre y cierra el comercio.'
 where key = 'out_of_hours';
update public.message_template_defaults
   set body = E'Somos {business_name}.\nHorario: {schedule}\nDirección: [escribe tu dirección]',
       allowed_placeholders = '{business_name,schedule}'
 where key = 'business_info';

-- ───────── Guía de configuración: paso "Horario" (opcional) ─────────
create or replace function public.get_onboarding_status(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_s public.tenant_settings;
  v_b public.tenant_branding;
  v_wa boolean; v_pay boolean; v_cat boolean; v_menu boolean; v_bill boolean; v_team boolean; v_hours boolean;
  v_block text[];
  v_steps jsonb := '[]'::jsonb;
begin
  if not public.is_tenant_member(p_tenant) then raise exception 'Not found' using errcode = 'P0002'; end if;
  select * into v_s from public.tenant_settings where tenant_id = p_tenant;
  select * into v_b from public.tenant_branding where tenant_id = p_tenant;
  v_wa := exists (select 1 from public.tenant_whatsapp_accounts where tenant_id = p_tenant and status = 'connected');
  v_pay := exists (select 1 from public.tenant_payment_methods where tenant_id = p_tenant and is_active);
  v_cat := exists (select 1 from public.products where tenant_id = p_tenant and is_available);
  v_menu := exists (select 1 from public.bot_menu_items i join public.bot_menus m on m.id = i.menu_id
                    where m.tenant_id = p_tenant and m.key = 'main');
  v_bill := public.tenant_is_billable(p_tenant);
  v_team := exists (select 1 from public.tenant_members where tenant_id = p_tenant and role = 'operator');
  v_hours := exists (select 1 from public.tenant_business_hours where tenant_id = p_tenant);

  v_block := array_remove(array[
    case when not v_wa then 'whatsapp' end, case when not v_pay then 'payment_methods' end,
    case when not v_cat then 'catalog' end, case when not v_bill then 'subscription' end], null);

  v_steps := jsonb_build_array(
    jsonb_build_object('key', 'business_profile', 'done', true, 'blocked_by', '[]'::jsonb),
    jsonb_build_object('key', 'branding', 'done', v_b.logo_path is not null, 'blocked_by', '[]'::jsonb),
    jsonb_build_object('key', 'business_hours', 'done', v_hours, 'blocked_by', '[]'::jsonb),
    jsonb_build_object('key', 'whatsapp', 'done', v_wa, 'blocked_by', '[]'::jsonb),
    jsonb_build_object('key', 'payment_methods', 'done', v_pay, 'blocked_by', '[]'::jsonb),
    jsonb_build_object('key', 'catalog', 'done', v_cat, 'blocked_by', '[]'::jsonb),
    jsonb_build_object('key', 'bot_menus', 'done', v_menu, 'blocked_by', '[]'::jsonb),
    jsonb_build_object('key', 'bot_messages', 'done', v_s.messages_reviewed_at is not null, 'blocked_by', '[]'::jsonb),
    jsonb_build_object('key', 'test_bot', 'done', v_s.bot_tested_at is not null, 'blocked_by', '[]'::jsonb),
    jsonb_build_object('key', 'subscription', 'done', v_bill, 'blocked_by', '[]'::jsonb),
    jsonb_build_object('key', 'team', 'done', v_team,
                       'blocked_by', case when v_bill then '[]'::jsonb else '["subscription"]'::jsonb end),
    jsonb_build_object('key', 'go_live', 'done', v_s.bot_enabled, 'blocked_by', to_jsonb(v_block)));
  return jsonb_build_object('steps', v_steps, 'bot_enabled', v_s.bot_enabled);
end; $$;
