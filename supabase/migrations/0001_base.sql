-- 0001_base: extensiones, tipos ENUM y utilidades comunes.
-- Sin tablas ni datos sensibles. Los ENUM son conjuntos cerrados sobre los que el código ramifica.

create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Roles de la plataforma (SaaS) y del comercio (ver propuesta, sección 5.1).
create type public.platform_role as enum ('developer', 'platform_admin');
create type public.tenant_role as enum ('owner', 'operator');
create type public.tenant_status as enum ('active', 'suspended');
create type public.business_type as enum ('restaurant', 'bakery', 'products', 'other');

-- Suscripción: incluye todos los estados que Stripe puede devolver.
create type public.subscription_status as enum
  ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused');
create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded');

-- WhatsApp y conversación.
create type public.whatsapp_status as enum ('pending', 'connected', 'error');
create type public.session_state as enum (
  'idle', 'browsing_menu', 'browsing_catalog', 'building_cart', 'awaiting_cart_confirmation',
  'awaiting_address', 'awaiting_notes', 'awaiting_payment_method', 'awaiting_proof',
  'awaiting_review', 'human_handoff', 'closed');
create type public.session_mode as enum ('bot', 'human');
create type public.cart_status as enum ('active', 'converted', 'abandoned');
create type public.message_direction as enum ('inbound', 'outbound');
create type public.sender_type as enum ('customer', 'bot', 'operator', 'system');
create type public.message_type as enum ('text', 'interactive', 'image', 'document', 'location', 'template', 'status', 'other');
create type public.webhook_status as enum ('received', 'processed', 'failed');
create type public.menu_action as enum ('submenu', 'show_category', 'show_product', 'business_info', 'request_agent', 'start_order');

-- Pedidos y pagos.
create type public.order_status as enum ('pending', 'approved', 'on_the_way', 'delivered', 'cancelled');
create type public.delivery_mode as enum ('delivery', 'pickup');
create type public.payment_method_type as enum ('bank_transfer', 'pago_movil', 'zelle', 'usdt', 'cash', 'other');
create type public.proof_status as enum ('submitted', 'accepted', 'rejected');

-- Mantiene updated_at al día en cada UPDATE.
create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Bloquea UPDATE/DELETE en tablas de registro inmutable (auditoría, historial).
-- El borrado en cascada (offboarding de un comercio) se permite: corre dentro de otro trigger.
create function public.forbid_modification() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'Records in % are immutable', tg_table_name using errcode = '42501';
end;
$$;
