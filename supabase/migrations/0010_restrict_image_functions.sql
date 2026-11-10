-- 0010: las funciones que resuelven la ruta de una foto pública solo las usa el servidor
-- (/api/public-files, con service role). Supabase concede EXECUTE a anon/authenticated por defecto,
-- así que hay que revocarlo de forma explícita (hallazgo del advisor de seguridad).
revoke execute on function public.get_public_product_image(uuid), public.get_public_cover_image(uuid)
  from public, anon, authenticated;
