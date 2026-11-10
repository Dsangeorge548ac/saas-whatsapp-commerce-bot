-- Pruebas de 0022 (vista previa de invitación). Usa el primer comercio existente; termina con
-- ALL_INVITATION_PREVIEW_TESTS_PASSED, que revierte todo.
do $$
declare tok text := repeat('ab', 32); tok2 text := repeat('cd', 32); t uuid; r jsonb;
begin
  select id into t from public.tenants limit 1;
  insert into public.tenant_invitations (tenant_id, email, token_hash, expires_at) values
    (t, 'invitee@t.test', encode(extensions.digest(tok, 'sha256'), 'hex'), now() + interval '7 days'),
    (t, 'expired@t.test', encode(extensions.digest(tok2, 'sha256'), 'hex'), now() - interval '1 day');
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  r := public.get_invitation_preview(tok);
  if r->>'email' <> 'invitee@t.test' or r->>'business_name' is null then raise exception 'FAILED valid %', r; end if;
  if public.get_invitation_preview(tok2) is not null then raise exception 'FAILED expired'; end if;
  if public.get_invitation_preview('nope') is not null then raise exception 'FAILED garbage'; end if;
  if public.get_invitation_preview(repeat('ef', 32)) is not null then raise exception 'FAILED unknown'; end if;
  reset role;
  update public.tenant_invitations set accepted_at = now() where email = 'invitee@t.test';
  set local role anon;
  if public.get_invitation_preview(tok) is not null then raise exception 'FAILED accepted'; end if;
  reset role;
  raise exception 'ALL_INVITATION_PREVIEW_TESTS_PASSED';
end $$;
