-- 0007: las funciones de trigger no deben ser llamables como RPC por anon/authenticated
-- (hallazgo del advisor de seguridad). Los triggers siguen funcionando: los dispara el motor.
revoke execute on function public.handle_new_user(), public.sync_profile_email() from public, anon, authenticated;
