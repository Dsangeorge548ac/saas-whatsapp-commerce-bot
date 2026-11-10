-- 0021: nuevas categorías de negocio: Restaurant, Store (comercio), Company (empresa) y Other.
--   * Se RENOMBRAN los valores del enum (no se borra nada): bakery → store, products → company. Los comercios
--     existentes conservan su categoría equivalente y las funciones que usan el tipo siguen funcionando.
--   * Mensajes sugeridos: se actualizan la restricción y las filas por tipo, con textos de bienvenida neutros
--     (un comercio ya no es necesariamente una panadería).
alter type public.business_type rename value 'bakery' to 'store';
alter type public.business_type rename value 'products' to 'company';

alter table public.message_template_defaults drop constraint message_template_defaults_business_type_check;
update public.message_template_defaults set business_type = 'store' where business_type = 'bakery';
update public.message_template_defaults set business_type = 'company' where business_type = 'products';
alter table public.message_template_defaults add constraint message_template_defaults_business_type_check
  check (business_type in ('all', 'restaurant', 'store', 'company', 'other'));

update public.message_template_defaults
   set body = E'¡Hola {customer_name}! 🛍️ Bienvenido a {business_name}. Mira nuestros productos y haz tu pedido aquí en pocos pasos.'
 where key = 'welcome' and business_type = 'store' and locale = 'es';
update public.message_template_defaults
   set body = E'Hola {customer_name}, bienvenido a {business_name}. Explora nuestro catálogo, haz tu pedido o pide hablar con un asesor.'
 where key = 'welcome' and business_type = 'company' and locale = 'es';
