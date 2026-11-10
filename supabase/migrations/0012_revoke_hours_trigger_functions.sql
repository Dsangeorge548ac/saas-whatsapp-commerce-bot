-- 0012: las funciones de trigger del horario no deben ser ejecutables como RPC por anon/authenticated.
revoke execute on function public.check_open_hours(), public.validate_tenant_timezone() from public, anon, authenticated;
