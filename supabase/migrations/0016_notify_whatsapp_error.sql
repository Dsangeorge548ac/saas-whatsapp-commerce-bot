-- 0016: aviso al DUEÑO cuando la conexión de WhatsApp deja de funcionar (token vencido o inválido).
-- Se crea solo al PASAR a `error` (no se repite mientras siga igual). Sin datos personales en el texto.
-- La función de trigger no es ejecutable por usuarios (no debe aparecer como RPC).
create function public.trg_notify_whatsapp_error() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'error' and old.status is distinct from 'error' then
    insert into public.notifications (tenant_id, user_id, kind, title, link)
    select new.tenant_id, m.user_id, 'whatsapp_error', 'WhatsApp connection needs attention', '/settings/whatsapp'
      from public.tenant_members m
     where m.tenant_id = new.tenant_id and m.role = 'owner';
  end if;
  return new;
end;
$$;
revoke execute on function public.trg_notify_whatsapp_error() from public, anon, authenticated;
create trigger whatsapp_account_error_notify after update of status on public.tenant_whatsapp_accounts
  for each row execute function public.trg_notify_whatsapp_error();
