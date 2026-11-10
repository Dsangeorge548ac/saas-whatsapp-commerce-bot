-- 0002_identity_roles_audit: perfiles, roles de plataforma, comercios, miembros, invitaciones,
-- funciones auxiliares de acceso y auditoría inmutable.
--
-- Tablas sensibles: platform_roles (poder sobre toda la plataforma), tenant_invitations.token_hash
-- (solo se guarda el hash del token), audit_logs y platform_access_log (inmutables).
-- RLS: activada en todas; sin política = sin acceso. Las escrituras sensibles van por RPC.

-- ───────── Perfiles (1:1 con auth.users) ─────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null default '' check (char_length(first_name) <= 80),
  last_name text not null default '' check (char_length(last_name) <= 80),
  email extensions.citext not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- Crea el perfil al registrarse. Solo lee nombre/apellido de la metadata; el rol NUNCA sale de ahí.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, first_name, last_name)
  values (
    new.id, new.email,
    left(coalesce(new.raw_user_meta_data ->> 'first_name', ''), 80),
    left(coalesce(new.raw_user_meta_data ->> 'last_name', ''), 80))
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mantiene el email del perfil igual al de Auth.
create function public.sync_profile_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.sync_profile_email();

-- ───────── Roles de plataforma ─────────
create table public.platform_roles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  role public.platform_role not null,
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ───────── Comercios y equipo ─────────
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug extensions.citext not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60),
  status public.tenant_status not null default 'active',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger tenants_updated before update on public.tenants
  for each row execute function public.set_updated_at();

create table public.tenant_members (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.tenant_role not null,
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index tenant_members_user_idx on public.tenant_members (user_id, tenant_id);

create table public.tenant_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  email extensions.citext not null check (char_length(email) <= 254),
  role public.tenant_role not null default 'operator' check (role = 'operator'),
  token_hash text not null unique,                 -- SHA-256 del token; el token solo viaja por correo
  invited_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
-- Una sola invitación abierta por (comercio, correo).
create unique index tenant_invitations_open_idx on public.tenant_invitations (tenant_id, email)
  where accepted_at is null and revoked_at is null;

-- ───────── Auditoría inmutable ─────────
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,   -- el registro sobrevive al usuario
  tenant_id uuid,                                                 -- sin FK: sobrevive al comercio
  target_user_id uuid,
  action text not null,
  resource text not null,
  ip_address text,
  details jsonb not null default '{}'::jsonb,                     -- nunca teléfonos completos ni URLs firmadas
  created_at timestamptz not null default now()
);
create index audit_logs_tenant_idx on public.audit_logs (tenant_id, created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);
create trigger audit_logs_immutable before update or delete on public.audit_logs
  for each row execute function public.forbid_modification();

-- Accesos de plataforma a datos de comercios (el comercio puede ver los suyos).
create table public.platform_access_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  tenant_id uuid,
  resource text not null,
  resource_id text,
  reason text,
  created_at timestamptz not null default now()
);
create index platform_access_log_tenant_idx on public.platform_access_log (tenant_id, created_at desc);
create trigger platform_access_log_immutable before update or delete on public.platform_access_log
  for each row execute function public.forbid_modification();

-- ───────── Funciones auxiliares de acceso (SECURITY DEFINER evita recursión de RLS) ─────────
create function public.is_developer() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_roles
                 where user_id = (select auth.uid()) and role = 'developer');
$$;

-- Verdadero para platform_admin Y developer.
create function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_roles where user_id = (select auth.uid()));
$$;

create function public.is_tenant_member(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tenant_members
                 where tenant_id = p_tenant and user_id = (select auth.uid()));
$$;

create function public.is_tenant_owner(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tenant_members
                 where tenant_id = p_tenant and user_id = (select auth.uid()) and role = 'owner');
$$;

-- ¿Comparte comercio con ese usuario? (el dueño ve los nombres de sus operadores).
create function public.shares_tenant_with(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tenant_members a
    join public.tenant_members b on b.tenant_id = a.tenant_id
    where a.user_id = (select auth.uid()) and b.user_id = p_user);
$$;

-- Registro de auditoría: solo la service role y funciones SECURITY DEFINER pueden llamarla.
create function public.log_audit(
  p_actor uuid, p_action text, p_resource text, p_tenant uuid default null,
  p_target uuid default null, p_ip text default null, p_details jsonb default '{}'::jsonb
) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_logs (actor_id, action, resource, tenant_id, target_user_id, ip_address, details)
  values (p_actor, p_action, p_resource, p_tenant, p_target, p_ip, coalesce(p_details, '{}'::jsonb));
$$;
revoke execute on function public.log_audit(uuid, text, text, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.log_audit(uuid, text, text, uuid, uuid, text, jsonb) to service_role;

-- Los helpers los usan las políticas RLS: deben poder ejecutarlos los usuarios autenticados.
revoke execute on function public.is_developer(), public.is_platform_admin(), public.is_tenant_member(uuid),
  public.is_tenant_owner(uuid), public.shares_tenant_with(uuid) from public, anon;
grant execute on function public.is_developer(), public.is_platform_admin(), public.is_tenant_member(uuid),
  public.is_tenant_owner(uuid), public.shares_tenant_with(uuid) to authenticated, service_role;

-- Los roles de plataforma solo los asigna un developer (o la service role / SQL, donde auth.uid() es nulo).
create function public.guard_platform_roles() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not public.is_developer() then
    raise exception 'Only a developer can manage platform roles' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;
revoke execute on function public.guard_platform_roles() from public, anon, authenticated;
create trigger platform_roles_guard before insert or update or delete on public.platform_roles
  for each row execute function public.guard_platform_roles();

-- ───────── RLS ─────────
alter table public.profiles enable row level security;
alter table public.platform_roles enable row level security;
alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.tenant_invitations enable row level security;
alter table public.audit_logs enable row level security;
alter table public.platform_access_log enable row level security;

revoke all on public.profiles, public.platform_roles, public.tenants, public.tenant_members,
  public.tenant_invitations, public.audit_logs, public.platform_access_log from anon, authenticated;

-- Perfiles: el propio, los de quien comparte comercio y, para auditar, el staff de plataforma.
grant select on public.profiles to authenticated;
grant update (first_name, last_name) on public.profiles to authenticated;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_tenant_with(id) or public.is_platform_admin());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

grant select on public.platform_roles to authenticated;
create policy platform_roles_select on public.platform_roles for select to authenticated
  using (user_id = (select auth.uid()) or public.is_platform_admin());

-- Comercios: miembros y staff de plataforma leen; solo el dueño cambia el nombre. Alta por create_tenant().
grant select on public.tenants to authenticated;
grant update (name) on public.tenants to authenticated;
create policy tenants_select on public.tenants for select to authenticated
  using (public.is_tenant_member(id) or public.is_platform_admin());
create policy tenants_update_owner on public.tenants for update to authenticated
  using (public.is_tenant_owner(id)) with check (public.is_tenant_owner(id));

-- Miembros: lectura; altas y bajas por RPC (invite/accept/remove).
grant select on public.tenant_members to authenticated;
create policy tenant_members_select on public.tenant_members for select to authenticated
  using (public.is_tenant_member(tenant_id) or public.is_platform_admin());

-- Invitaciones: solo el dueño las ve, y sin la columna token_hash.
grant select (id, tenant_id, email, role, invited_by, expires_at, accepted_at, revoked_at, created_at)
  on public.tenant_invitations to authenticated;
create policy tenant_invitations_select on public.tenant_invitations for select to authenticated
  using (public.is_tenant_owner(tenant_id));

-- Auditoría: dueño (su comercio) y staff de plataforma. Nadie escribe desde el cliente.
grant select on public.audit_logs to authenticated;
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (public.is_platform_admin() or (tenant_id is not null and public.is_tenant_owner(tenant_id)));

grant select on public.platform_access_log to authenticated;
create policy platform_access_log_select on public.platform_access_log for select to authenticated
  using (public.is_platform_admin() or (tenant_id is not null and public.is_tenant_owner(tenant_id)));
