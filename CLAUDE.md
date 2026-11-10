# Bot de comercio por WhatsApp — Reglas del proyecto

SaaS multi-comercio (panaderías, restaurantes, empresas que venden productos): el cliente final pide por WhatsApp,
el dueño configura todo gratis y **paga una suscripción (Stripe) para activar el bot, invitar operadores y gestionar
pedidos**. Diseño completo en `docs/propuesta-modelo-datos.md` (léelo antes de cambiar el modelo de datos).

> Next.js 16.4 trae cambios (`cacheComponents`, `proxy.ts`, `LayoutProps`…). Antes de usar una API de Next, consulta
> `node_modules/next/dist/docs/`.

## Stack (mismo que Tax Pro; no cambiar sin preguntar)

Next.js 16 (App Router) + React 19 + TypeScript `strict` · Tailwind v4 (tokens en `app/globals.css`) · shadcn/ui +
lucide-react · React Hook Form + Zod · Supabase (Auth, Postgres, Storage, Realtime) con `@supabase/ssr` · Stripe
(suscripciones, módulo pendiente) · API de WhatsApp Cloud de Meta (módulo pendiente). Fuente Geist, solo modo claro.

## Origen del diseño y la seguridad

La interfaz (login, riel lateral, panel redondeado, colores, radio de 8 px, logo, componentes de `components/ui`,
`feedback`, `forms`) y las prácticas de seguridad se copiaron de `../tax-pro`. Cuando Tax Pro y este archivo difieran en
la UI, **gana Tax Pro tal como está hoy** (su acento actual es casi negro, no lima). Sin teléfono: los usuarios son el
dueño y los operadores, identificados por email + contraseña (12+) + código OTP por email.

## Reglas generales

- **Límite duro: 1,000 líneas por archivo.** Objetivo: componentes ≤ 250, Server Actions ≤ 150.
- Código claro para un Full Stack Jr.; sin abstracciones "por si acaso".
- **Comentarios en español** (cabecera en cada componente, hook y Server Action: qué hace, quién lo usa, qué valida;
  comentario antes de cada validación de seguridad). **UI y nombres de código en inglés.**
- **Paginación y filtros siempre en el servidor** (`count` + `.range()`, estado en la URL validado con Zod).
- Sin dependencias nuevas sin justificarlas.

## Seguridad que nunca se rompe

1. Nunca confiar en el cliente: **toda Server Action revalida con Zod y vuelve a comprobar sesión, rol y suscripción**.
   Los layouts no protegen las acciones.
2. En el servidor: `getClaims()`/`getUser()`, **nunca** `getSession()` para decidir acceso.
3. `SUPABASE_SERVICE_ROLE_KEY` solo en `lib/supabase/admin.ts` (`server-only`): webhook de Meta, webhook de Stripe,
   auditoría, límite de intentos y entrega de archivos privados (después de autorizar). Ninguna variable secreta lleva
   `NEXT_PUBLIC_`. Variables validadas con Zod en `lib/env.ts` y `lib/env.server.ts`.
4. Datos sensibles (teléfonos y ubicaciones de clientes, comprobantes, credenciales) nunca en URLs, logs ni errores.
5. Todo evento sensible a `audit_logs` vía `logAudit()`; `details` nunca lleva teléfonos completos ni tokens.
6. **RLS en toda tabla** (denegar por defecto); escrituras sensibles solo por RPC `SECURITY DEFINER` con
   `SET search_path = ''` y `REVOKE EXECUTE … FROM public, anon, authenticated` explícito. Toda tabla/función nueva se
   cubre en `supabase/tests/`.
7. Archivos en buckets **privados**, servidos solo por una ruta del servidor que autoriza (no-store). Única excepción:
   fotos de productos de publicaciones publicadas.
8. Webhook de Meta: verificar `X-Hub-Signature-256` con el app secret **antes** de tocar la base; idempotencia por `wamid`.
9. Cabeceras de seguridad globales en `next.config.ts` (no se quitan).
10. Anti fuerza bruta propio (`lib/auth/rate-limit.ts`, función `take_attempt`): login, OTP, envío de códigos y registro.

## Reglas de negocio ya impuestas por la base de datos

- Pedido: `awaiting_payment → pending (comprobante recibido) → approved → on_the_way → delivered`; `cancelled` con motivo
  desde los tres primeros. Solo cambia el estado (todo lo demás es inmutable) y cada cambio queda en `order_status_history`.
- Sin suscripción vigente (`tenant_is_billable`): no se invita, no se activa el bot, no se opera. 7 días de gracia en `past_due`.
- Sin pedidos fuera del horario del comercio (`OUTSIDE_HOURS`). Delivery exige ubicación GPS si `require_delivery_location`.
- Roles: `developer` > `platform_admin` (auditoría de solo lectura, sin datos de clientes) > `owner` > `operator`.

## Estructura

```
app/(auth)/   login, register, verify, forgot-password, account-disabled
app/(app)/    dashboard, orders, chats, catalog, settings, notifications   (riel lateral + panel redondeado)
features/<modulo>/  components, actions, schemas, queries
lib/supabase/ (client, server, admin, proxy) · lib/auth/ · lib/data/workspace.ts (get_my_workspace, una llamada)
supabase/migrations/  SQL numerado y comentado (0001…)     supabase/tests/  pruebas de RLS y de reglas
```

## Entorno

Un proyecto de Supabase en la nube (`whatsapp-commerce-bot`, `us-east-1`), sin Docker. Migraciones: se escriben en
`supabase/migrations/` y se aplican con el conector MCP (`apply_migration`); después regenerar `types/database.ts` y
revisar `get_advisors`. Tiendas públicas: `<slug>.<NEXT_PUBLIC_STORE_BASE_DOMAIN>` (en local `slug.localhost:3000`).
Compatible con Vercel: cero URLs fijas, sin disco, cookies seguras en HTTPS, `npm run build` debe pasar en local.

## Antes de terminar cualquier tarea

```
npm run lint
npm run typecheck
npm run build
```

Con migraciones nuevas: aplicarlas, regenerar tipos, correr las pruebas de `supabase/tests/` y revisar los advisors.
Reportar qué se verificó y qué no.
