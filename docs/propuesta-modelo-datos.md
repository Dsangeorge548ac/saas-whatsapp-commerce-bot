# Propuesta técnica — Modelo de datos SaaS B2B Multi-tenant de Comercio Conversacional (WhatsApp)

> Documento de diseño. **No contiene SQL de implementación.** Stack: PostgreSQL (Supabase) + Next.js 16, replicando las prácticas de seguridad, login y dashboard de Tax Pro.

## 0. Decisiones base y alcance

| Tema | Decisión | Justificación / trade-off |
|---|---|---|
| Aislamiento multi-tenant | **Una sola base, esquema compartido, columna `tenant_id` en toda tabla de negocio + RLS** | Es la opción más barata y simple de operar en Supabase. Trade-off: un error de política expone datos entre comercios, por eso cada tabla nueva se cubre con pruebas RLS de dos tenants (igual que `rls_security_test.sql` en Tax Pro). Esquema-por-tenant o BD-por-tenant daría más aislamiento pero multiplica migraciones y conexiones: inviable en Supabase a esta escala. |
| Identificadores | `uuid` PK (`gen_random_uuid()`); ids opacos en URLs | Evita enumeración y datos personales en rutas (regla 8 de Tax Pro). Trade-off: 16 bytes y peor localidad que `bigint`; para tablas de altísimo volumen (`messages`, `webhook_events`) se evalúa `uuidv7` (ordenable por tiempo) para reducir fragmentación del índice. |
| Usuarios de la app | Solo **dueño (`owner`)** y **operador (`operator`)**, identificados por **email + contraseña (≥12 caracteres) + OTP de 6 dígitos por email**. **Sin verificación telefónica** | Pedido explícito: el correo ya identifica al usuario. El teléfono del *cliente final* (WhatsApp) sí se guarda, pero lo valida Meta (llega firmado por el webhook), no un OTP. |
| Registro | El dueño se registra y crea su comercio (`tenant`); los operadores entran **por invitación** del dueño | Nadie se auto-asigna a un comercio ajeno; el rol nunca se lee de `user_metadata` (regla de Tax Pro). |
| Sin MFA TOTP | Igual que Tax Pro (decisión previa del usuario) | Se compensa con rate limit propio, bloqueo y auditoría. |
| Zona horaria / moneda | Todo `timestamptz` en UTC; cada tenant define `timezone` y `currency` base | Evita errores de DST; la UI convierte. |

---

## 1. Normalización y relaciones (3FN)

### 1.1 Mapa de entidades

```
auth.users ─1:1─ profiles ─N:M─ tenants   (vía tenant_members: rol owner|operator)
                               │
tenants ─1:1─ tenant_whatsapp_accounts (credenciales Meta)
        ─1:1─ tenant_branding
        ─1:N─ tenant_payment_methods
        ─1:N─ tenant_invitations
        ─1:N─ categories ─1:N─ products ─1:N─ product_options (opcional, fase 2)
        ─1:N─ bot_menus ─1:N─ bot_menu_items (árbol)
        ─1:N─ customers ─1:N─ customer_addresses
                        ─1:N─ conversation_sessions ─1:1─ carts ─1:N─ cart_items
                        ─1:N─ orders ─1:N─ order_items
                                       ─1:N─ order_status_history
                                       ─1:N─ payment_proofs
        ─1:N─ messages (todas las conversaciones)
        ─1:N─ webhook_events (idempotencia + cola)
        ─1:N─ audit_logs · notifications
Globales (sin tenant): auth_rate_limits, platform_admins (opcional)
```

### 1.2 Entidades, justificación, llaves y reglas de borrado

| Entidad | Propósito / justificación | PK · FK principales | Cardinalidad | ON DELETE |
|---|---|---|---|---|
| `profiles` | Identidad del operador/dueño (nombre, email espejo). Separada de `auth.users` porque `auth` no se expone por API. Creada por trigger `handle_new_user`. | `id` = FK `auth.users.id` | 1:1 con `auth.users` | CASCADE |
| `tenants` | El comercio: nombre, slug, `timezone`, `currency`, estado (`active/suspended`). Raíz del aislamiento. | `id` | — | — (se *suspende*, no se borra; borrado físico solo por proceso de offboarding) |
| `tenant_members` | Tabla puente usuario↔comercio con `role`. Permite que un usuario administre varios comercios y mantiene el rol **fuera** de `profiles` (3FN: el rol depende de la pareja usuario+tenant, no solo del usuario). | PK `(tenant_id, user_id)`; FK `tenants`, `profiles` | **N:M** | CASCADE ambos lados |
| `tenant_invitations` | Alta de operadores: email, rol, hash del token, expiración, `accepted_at`. | `id`; FK `tenants`, `invited_by`→`profiles` | 1:N | CASCADE (tenant); SET NULL (`invited_by`) |
| `tenant_whatsapp_accounts` | Credenciales independientes de Meta: `waba_id`, `phone_number_id` (**único global**: es la llave de enrutamiento del webhook), número visible, `access_token_ref` (referencia a **Supabase Vault**, nunca el token en claro), `webhook_verify_token_hash`, `status`. | `id`; FK `tenants` | **1:1** (UNIQUE `tenant_id`); extensible a 1:N si un comercio usa varios números | CASCADE |
| `tenant_branding` | Logo (ruta de Storage), color, nombre comercial, mensaje de bienvenida/despedida. Separada para no inflar `tenants` (>12 columnas = mezcla de temas, regla 7 de Tax Pro). | `tenant_id` PK/FK | 1:1 | CASCADE |
| `tenant_payment_methods` | Métodos que el bot presenta: `type` (enum: `bank_transfer`, `pago_movil`, `zelle`, `usdt`, `cash`…), `label`, `details jsonb` (titular, banco, cuenta, red USDT, wallet…), `currency`, `is_active`, `sort_order`. | `id`; FK `tenants` | 1:N | CASCADE (tenant); los pedidos guardan **snapshot**, no FK dura |
| `categories` | Agrupa productos y alimenta listas interactivas (máx. 10 filas por lista en WhatsApp). | `id`; FK `tenants`; UNIQUE `(tenant_id, name)` | 1:N | CASCADE (tenant); `products.category_id` → SET NULL |
| `products` | Catálogo: nombre, descripción, `price`, `currency`, `image_path`, `is_available`, `sku` opcional. Para maquinaria/menús se puede ocultar precio con `price_visible` (consulta por asesor). | `id`; FK `tenants`, `categories` | 1:N | CASCADE (tenant); **RESTRICT** si hay `order_items` que lo referencian como FK blanda → ver snapshots (se usa `SET NULL`) |
| `bot_menus` / `bot_menu_items` | Menús configurables: cada ítem es un **botón** (≤3 por mensaje) o fila de **lista** (≤10), con `action` (enum: `submenu`, `show_category`, `show_product`, `business_info`, `request_agent`, `start_order`), `payload` y `parent_id` (árbol). Configuración en filas, no en JSON opaco, para validar con CHECK y FKs. | `id`; `bot_menu_items.menu_id`→`bot_menus`, `parent_id` auto-FK, `category_id` | 1:N, árbol | CASCADE (menu→items); `parent_id` CASCADE; `category_id` SET NULL |
| `customers` | Cliente final **por tenant** (el mismo teléfono es un cliente distinto en cada comercio: privacidad entre tenants). `wa_id`/teléfono E.164, `profile_name` (el que envía Meta), `opted_out`. | `id`; FK `tenants`; **UNIQUE `(tenant_id, phone_e164)`** | 1:N | CASCADE (tenant); RESTRICT si tiene pedidos (se anonimiza, no se borra: integridad contable) |
| `customer_addresses` | Direcciones reutilizables (texto, referencia, lat/lng opcional). | `id`; FK `customers` | 1:N | CASCADE |
| `conversation_sessions` | FSM de la conversación (ver §2). | `id`; FK `tenants`, `customers`, `assigned_to`→`profiles` | 1:N por cliente (una *activa*) | CASCADE (tenant); `assigned_to` SET NULL |
| `carts` / `cart_items` | Carrito temporal pre-orden (ver §2). | `carts.session_id` UNIQUE FK; `cart_items.(cart_id, product_id)` | 1:1 sesión; 1:N ítems | CASCADE; `product_id` **RESTRICT→ se usa CASCADE solo en items** (ítem sin producto no tiene sentido) |
| `orders` | Pedido formal: totales, estado, dirección y notas (snapshot), método de pago elegido (snapshot), `placed_at`. | `id`; FK `tenants`, `customers` (RESTRICT), `session_id` (SET NULL); `order_number` UNIQUE `(tenant_id, order_number)` | 1:N | tenant CASCADE; customer RESTRICT |
| `order_items` | Renglones con **snapshot** (nombre, precio, cantidad, subtotal). | `id`; FK `orders` CASCADE, `product_id` SET NULL | 1:N | CASCADE desde `orders`; producto SET NULL |
| `order_status_history` | Bitácora **append-only** de cada cambio: `from_status`, `to_status`, `actor_type` (enum `customer`, `bot`, `operator`, `system`), `actor_user_id`, `reason`, `created_at`. | `id`; FK `orders` | 1:N | CASCADE desde `orders` (pero `orders` casi nunca se borra) |
| `payment_proofs` | Comprobante/referencia: `storage_path` (ruta, nunca URL), `reference_number`, `amount_declared`, `currency`, `status` (`submitted/accepted/rejected`), `reviewed_by`, `rejection_reason`. Tabla propia porque un pedido puede tener varios intentos (rechazo → reenvío). | `id`; FK `orders` CASCADE, `reviewed_by` SET NULL | 1:N | CASCADE |
| `messages` | Registro de todo mensaje entrante/saliente (`wamid`, dirección, tipo, `body`, `payload jsonb`, `sender_type`, `sender_user_id`, `status`). Alimenta el chat del asesor humano y la auditoría humano vs. automático. | `id`; FK `tenants`, `customers`, `session_id` SET NULL; **UNIQUE `(tenant_id, wamid)`** | 1:N | CASCADE (tenant/customer) |
| `webhook_events` | Entrada cruda del webhook: llave de idempotencia (`event_key`), `payload jsonb`, `status` (`received/processed/failed`), `attempts`. Separada de `messages` para poder reintentar y depurar sin ensuciar el chat. Retención 30–90 días. | `id`; FK `tenants` (nullable si no se resolvió) | 1:N | CASCADE / SET NULL |
| `audit_logs` | Eventos sensibles (login, cambio de rol, aprobación de comprobante, apertura de comprobante, cambio de credenciales Meta…). Inmutable. | `id`; `actor_id` → `auth.users` **SET NULL** (sobrevive al usuario); `tenant_id` sin FK dura | — | SET NULL |
| `notifications` | Alertas en el dashboard (pedido nuevo, comprobante recibido, cliente pide asesor). Una fila por miembro para tener leído/no leído propio, creada solo por triggers. | `id`; FK `tenants`, `user_id` | 1:N | CASCADE |
| `auth_rate_limits` | Anti fuerza bruta propio (claves SHA-256, solo service role), idéntica a Tax Pro. | PK clave hash | — | — |

### 1.3 Snapshots históricos (inmutabilidad contable)

| Dato | Dónde se congela | Por qué |
|---|---|---|
| `product_name`, `unit_price`, `currency`, `sku` | `order_items` | Si mañana sube el precio o se renombra/borra el producto, el pedido histórico y los reportes no cambian. `product_id` queda como FK blanda (`SET NULL`) solo para navegación. |
| `subtotal`, `delivery_fee`, `total`, `exchange_rate` | `orders` | El total se calcula **una vez** al confirmar y se guarda; evita recalcular con precios nuevos. La tasa de cambio (VES/USD/USDT) del momento se congela: crítico para validar el comprobante. |
| Método de pago elegido (`payment_method_type`, `payment_details_snapshot jsonb`) | `orders` | El comercio puede cambiar su cuenta bancaria; el pedido debe recordar a **qué cuenta** se le pidió pagar. |
| Dirección y notas de entrega | `orders.delivery_address_text`, `delivery_notes` | `customer_addresses` es editable; el repartidor y la auditoría necesitan la dirección **tal como estaba** al pedir. |
| Nombre y teléfono del cliente | `orders.customer_name_snapshot`, `customer_phone_snapshot` | Sobrevive a la anonimización del cliente (derecho de supresión) sin perder el registro contable. |
| `unit_price` en `cart_items` | Se guarda al agregar, pero **se re-valida al confirmar** | Un carrito puede vivir horas; al pedir "confirmar" se re-precia y, si cambió, se avisa al cliente antes de cobrar. |

**Trade-off:** los snapshots duplican datos (rompen 3FN *a propósito* en esos campos). Es la desnormalización correcta: son hechos históricos distintos de los datos vivos, no redundancia accidental.

---

## 2. Manejo de estados y sesiones (FSM de WhatsApp)

### 2.1 ¿Tabla de sesiones dedicada? **Sí: `conversation_sessions`.**

Alternativas descartadas: guardar el estado en `customers` (mezcla temas y no permite historial de sesiones) o en Redis/memoria (Vercel no tiene estado entre invocaciones y se pierde el carrito). Trade-off de la tabla: una escritura extra por mensaje; se mitiga con *una sola fila viva* por cliente y `UPDATE` con control optimista.

**Columnas clave:** `tenant_id`, `customer_id`, `state` (enum), `state_context jsonb` (datos mínimos del paso: `menu_item_id`, `pending_product_id`, página de lista…), `mode` (enum `bot | human`), `assigned_to`, `handoff_requested_at`, `last_inbound_at`, `window_expires_at` (ventana de 24 h de Meta: fuera de ella solo plantillas), `expires_at` (TTL del carrito), `version int` (optimistic locking), `closed_at`.

**Estados (enum `session_state`):** `idle` · `browsing_menu` · `browsing_catalog` · `building_cart` · `awaiting_cart_confirmation` · `awaiting_address` · `awaiting_notes` · `awaiting_payment_method` · `awaiting_proof` · `awaiting_review` (comprobante enviado, pedido en `pending`) · `human_handoff` · `closed`.

**Reglas:**
- Índice único parcial: **una sola sesión no cerrada por `(tenant_id, customer_id)`**.
- Transiciones válidas en una tabla/función `session_transitions` o en una función `advance_session()`: la base rechaza saltos ilegales (ej. `building_cart → awaiting_proof`). Trade-off: lógica en SQL es más rígida de cambiar que en código, pero blinda contra *race conditions* de webhooks concurrentes.
- `state_context` es `jsonb` **solo** para datos efímeros; nada contable vive ahí.
- Sesiones inactivas > N horas pasan a `closed` por un job (`pg_cron`); el carrito pasa a `abandoned`.

### 2.2 Carrito activo antes de ser orden

- `carts` (1:1 con la sesión, `status`: `active | converted | abandoned`) + `cart_items` (`product_id`, `quantity > 0`, `unit_price_snapshot`, UNIQUE `(cart_id, product_id)`).
- Se eligió tabla relacional y **no** un `jsonb` en la sesión: permite sumar, validar disponibilidad, hacer FK al producto y reportes de abandono. Trade-off: más filas y joins; asumible por su integridad.
- **Conversión a orden:** una función `SECURITY DEFINER` (`confirm_cart_as_order`) en **una transacción**: bloquea el carrito, re-precia, copia a `order_items` con snapshots, crea `orders` en `pending`, marca el carrito `converted`, avanza la FSM. Atómica e idempotente (si Meta reintenta el webhook, no crea dos pedidos: `orders.source_wamid` UNIQUE).

### 2.3 Cambio a atención humana

1. El cliente elige "hablar con un asesor" (o un `bot_menu_items.action = 'request_agent'`).
2. `mode = 'human'`, `state = 'human_handoff'`, `handoff_requested_at = now()`; trigger crea `notifications` para operadores y el Kanban/Inbox muestra la alerta.
3. Mientras `mode = 'human'`, el procesador del webhook **solo registra** el mensaje y **no responde automáticamente**.
4. Un operador **toma** la sesión (`assigned_to`, operación atómica: gana el primero, patrón de `claim_support_case` de Tax Pro).
5. Retorno al bot: lo cierra el operador ("devolver al bot") o expira por inactividad. Cada mensaje guarda `sender_type` + `sender_user_id` → **auditoría humano vs. automático**.

### 2.4 Estados del pedido (Kanban)

`order_status`: `pending` → `approved` → `on_the_way` → `delivered` (secuenciales), más **`cancelled`** como salida lateral (rechazo definitivo de comprobante / cancelación). **Recomendación:** agregarlo aunque el enunciado liste 4; sin él, un pedido rechazado quedaría "colgado" en Pendiente. Trade-off: una columna más en el Kanban (se puede ocultar como "archivo").

- Un trigger `BEFORE UPDATE OF status` solo permite el siguiente estado válido (o `cancelled` desde `pending/approved`) y **inserta en `order_status_history`** en la misma transacción: no hay forma de cambiar el estado sin dejar rastro, ni siquiera con service role.
- `on_the_way` dispara un mensaje interactivo al cliente ("¿Recibiste tu pedido?" con botones) → su respuesta lleva a `delivered` con `actor_type = 'customer'`.

---

## 3. Tipos de datos y restricciones

### 3.1 Tipos

| Atributo | Tipo | Razón |
|---|---|---|
| Ids | `uuid` | ver §0 |
| Montos, precios | **`numeric(14,2)`** (fiat) | Exacto; nunca `float`/`money`. Trade-off vs. enteros en centavos: `numeric` es más legible y SQL-friendly; los enteros evitan errores de redondeo en la app pero obligan a convertir siempre. |
| USDT y tasas | `numeric(20,6)` (monto USDT) · `numeric(18,8)` (tasa) | USDT usa 6 decimales; tasas VES/USD necesitan precisión. |
| Moneda | `char(3)`/enum (`USD`, `VES`, `USDT`) con CHECK | Un monto sin moneda no existe: siempre par `(amount, currency)`. |
| Teléfono cliente | `text` en **E.164** con CHECK `^\+[1-9][0-9]{7,14}$` | Misma regla que Tax Pro. Se guarda **sin** formato visual; Meta envía `wa_id` sin `+` → se normaliza al entrar. |
| Email | `citext` (extensión) | Unicidad insensible a mayúsculas. |
| Fechas | `timestamptz` | UTC siempre. |
| Config flexible (`details`, `payload`, `state_context`) | `jsonb` | Solo para datos sin esquema estable; validado con CHECK `jsonb_typeof` y Zod en el servidor. |
| Texto libre | `text` + CHECK de longitud | Sin `varchar(n)` arbitrarios; límites explícitos para notas (≤500), nombre (≤120). |

### 3.2 ENUMs

`tenant_role` (`owner`, `operator`) · `order_status` (`pending`, `approved`, `on_the_way`, `delivered`, `cancelled`) · `session_state` · `session_mode` (`bot`, `human`) · `message_direction` (`inbound`, `outbound`) · `sender_type` (`customer`, `bot`, `operator`, `system`) · `message_type` (`text`, `interactive`, `image`, `document`, `location`, `template`, `status`) · `payment_method_type` · `proof_status` · `menu_action` · `webhook_status`.
**Trade-off ENUM vs. tabla catálogo:** los ENUM son rápidos y seguros, pero **agregar** valores es una migración y **quitar** es doloroso. Se usan ENUM para conjuntos cerrados que el código ramifica (estados, roles); se usa **tabla catálogo** para lo que el comercio extiende (categorías, y `payment_method_type` si se quiere permitir métodos personalizados).

### 3.3 UNIQUE

- `tenant_whatsapp_accounts.phone_number_id` (global) y `tenant_id`.
- `customers (tenant_id, phone_e164)`.
- `messages (tenant_id, wamid)` y `webhook_events (event_key)`.
- `orders (tenant_id, order_number)` — número secuencial **por tenant** (contador en `tenants` o tabla `tenant_counters` con `UPDATE ... RETURNING`, no `MAX()+1`).
- `orders.source_wamid` (idempotencia de creación).
- `conversation_sessions`: único parcial una activa por cliente.
- `payment_proofs`: único parcial un comprobante `submitted` por pedido.
- `tenant_members (tenant_id, user_id)`; `categories (tenant_id, name)`; `cart_items (cart_id, product_id)`.

### 3.4 CHECK

`price >= 0` · `quantity > 0` · `total = subtotal + delivery_fee - discount` · `delivery_fee >= 0` · teléfono E.164 · `reviewed_at IS NOT NULL` si `status <> 'submitted'` · `rejection_reason IS NOT NULL` si rechazado · `handoff` coherente (`mode = 'human'` ⇒ `handoff_requested_at IS NOT NULL`) · jerarquía de menú: botones ≤3 / lista ≤10 por padre (trigger, porque no es expresable en CHECK de una fila) · `jsonb_typeof(details) = 'object'`.

---

## 4. Estrategia de índices y rendimiento

| Consulta frecuente | Índice propuesto | Notas |
|---|---|---|
| **Webhook: tenant por número de Meta** | `UNIQUE (phone_number_id)` en `tenant_whatsapp_accounts` | Lookup O(1) en cada petición; es la primera consulta del handler. |
| **Webhook: cliente por teléfono y tenant** | `UNIQUE (tenant_id, phone_e164)` en `customers` | El índice único ya sirve como índice de búsqueda (no duplicar). |
| **Sesión activa del cliente** | Único parcial `(tenant_id, customer_id) WHERE closed_at IS NULL` | Una fila viva ⇒ índice minúsculo. |
| **Idempotencia de mensajes** | `UNIQUE (tenant_id, wamid)` en `messages` + `UNIQUE (event_key)` en `webhook_events` | Patrón: `INSERT ... ON CONFLICT DO NOTHING RETURNING`; si no devuelve fila, es duplicado y se responde 200 sin reprocesar. Es **atómico**: no hay "SELECT luego INSERT" (condición de carrera). Meta reintenta webhooks, así que esto es obligatorio. Los *status updates* (sent/delivered/read) comparten `wamid`: llave `(wamid, status)`. |
| **Kanban por estado** | `(tenant_id, status, created_at DESC)` en `orders` | Cubre columna + orden. |
| Kanban solo pedidos "vivos" | **Parcial** `(tenant_id, status, updated_at DESC) WHERE status <> 'delivered' AND status <> 'cancelled'` | El tablero real casi nunca mira los entregados; el índice parcial es una fracción del tamaño. Entregados se consultan en historial paginado. |
| Tiempo real del Kanban | Publicar `orders` en `supabase_realtime` | RLS aplica a Realtime: cada comercio solo recibe lo suyo. Filtro de canal por `tenant_id`. |
| Historial de un pedido | `(order_id, created_at)` en `order_status_history` | |
| Chat del asesor | `(tenant_id, customer_id, created_at DESC)` en `messages` | Paginación por cursor (`created_at`, `id`). |
| Cola de asesor | Parcial `(tenant_id, handoff_requested_at) WHERE mode='human' AND assigned_to IS NULL` | |
| Comprobantes por revisar | Parcial `(tenant_id, created_at) WHERE status='submitted'` | |
| Políticas RLS | `tenant_members (user_id, tenant_id)` + `tenant_id` como **primera columna** de todo índice compuesto | Las políticas filtran por `tenant_id` en cada consulta; sin esto, RLS degrada. |
| Carritos abandonados (job) | Parcial `(expires_at) WHERE status='active'` | |

**Otras decisiones de rendimiento**
- `messages` y `webhook_events` crecen rápido: **particionado por mes** (`created_at`) en fase 2, con retención de `webhook_events` (30–90 d). Trade-off: las UNIQUE globales exigen incluir la clave de partición → por eso la idempotencia fuerte vive en `webhook_events (event_key)` (tabla pequeña y depurada) y no en la tabla particionada.
- Paginación **siempre en el servidor** (`count` + `range`, o cursor), igual que Tax Pro.
- Una función `get_my_workspace()` (una llamada por petición) para el estado del dashboard, como en Tax Pro.
- Respuesta rápida del webhook: validar firma → insertar en `webhook_events` → responder **200 en < 1 s** → procesar (Meta reintenta si tarda). Trade-off: procesamiento asíncrono exige cola/`pg_cron`/Edge Function, pero evita reintentos duplicados y timeouts.

---

## 5. Seguridad y multi-inquilino (Supabase RLS)

### 5.1 Modelo de roles (4 niveles, en dos ámbitos)

Los roles de **plataforma** viven en una tabla propia (`platform_roles`) y los del **comercio** en `tenant_members`: así nadie puede ganar poder de plataforma por ser dueño de un comercio, ni al revés.

| Ámbito | Rol | Alcance |
|---|---|---|
| Plataforma | **`developer`** | **Acceso total** a la plataforma (todos los comercios, configuración, funciones y datos). Es el único que asigna o quita roles de plataforma. |
| Plataforma | **`platform_admin`** (administrador del SaaS) | **Auditoría** transversal en **solo lectura** de la información importante (ver 5.1.1). No opera pedidos ni edita catálogos. |
| Comercio | **`owner`** (administrador del comercio: empresa, restaurante, panadería) | Todo dentro de **su** comercio: WhatsApp, pagos, catálogo, menús, mensajes, suscripción y equipo. |
| Comercio | **`operator`** | Operación diaria: pedidos, comprobantes y chats. Sin credenciales, suscripción ni equipo. |

Jerarquía: `developer` > `platform_admin` > `owner` > `operator`. Un `platform_admin` **no** puede modificar a un `developer` (dos capas, como en Tax Pro: la Server Action lo rechaza y un trigger lo bloquea en la base). Los roles de plataforma solo los da un `developer` o SQL directo; **nunca** se leen de `user_metadata` ni de la UI del comercio.

#### 5.1.1 Qué audita el administrador del SaaS (solo lectura)

- **Sí ve:** `audit_logs` de todos los comercios, comercios y su estado, suscripciones y pagos, miembros y roles, métricas agregadas de pedidos (conteos y montos, no contenido), salud de la conexión de WhatsApp (estado, no tokens) y altas/bajas de operadores.
- **No ve por defecto:** el texto de las conversaciones, los comprobantes de pago, direcciones ni teléfonos de clientes finales, ni credenciales de Meta. Son datos personales del cliente del comercio.
- **Acceso excepcional con justificación (*break-glass*):** si una auditoría o soporte exige ver un comprobante o una conversación, se hace con una RPC que **exige un motivo**, abre el dato por tiempo limitado y lo registra en `platform_access_log` (quién, qué comercio, qué recurso, motivo, hora). El comercio puede ver ese registro en su propia auditoría (transparencia).
- **Trade-off:** menos visibilidad por defecto hace la auditoría un poco más lenta en casos raros, pero protege al cliente final y reduce el riesgo legal y reputacional del SaaS.

#### 5.1.2 Acceso total del developer

- Ve y modifica todo mediante **funciones y acciones del servidor**, no desde el navegador con la clave de servicio. Las operaciones de servicio no pasan por RLS, por eso la defensa es: comprobación explícita del rol en cada acción (`requireDeveloper()`), el mismo 404 ante cualquier otro, y **todo acceso a datos de comercios queda en `platform_access_log`**, incluidos los de lectura de contenido sensible.
- Puede: suspender o reactivar comercios, otorgar acceso de cortesía, corregir suscripciones (vía Stripe, como en Tax Pro), asignar roles de plataforma, ver y reintentar `webhook_events` fallidos, y entrar en modo soporte a un comercio.
- La **service role key** solo existe en el servidor (`lib/supabase/admin.ts` con `server-only`), igual que Tax Pro.
- **Trade-off:** "acceso total" es un riesgo si la cuenta se compromete. Se mitiga con contraseña fuerte, límite de intentos, sesiones revocables, auditoría inmutable y, recomendado, MFA obligatorio solo para este rol (en Tax Pro no hay MFA para usuarios normales; para `developer` conviene hacer la excepción).

#### 5.1.3 Entidades nuevas

| Entidad | Propósito | PK · FK | ON DELETE |
|---|---|---|---|
| `platform_roles` | Rol de plataforma por usuario (`developer` o `platform_admin`), quién lo otorgó y cuándo. | `user_id` PK/FK `profiles` | CASCADE |
| `platform_access_log` | Registro inmutable de accesos de plataforma a datos de comercios (con motivo en los de contenido sensible). | `id`; `actor_id` SET NULL, `tenant_id` sin FK dura | — |

Helpers `SECURITY DEFINER` (`search_path = ''`): `is_developer()`, `is_platform_admin()` (verdadero también para `developer`), `is_platform_staff()`. Las políticas RLS de lectura transversal usan `is_platform_admin()` solo en las tablas de la lista 5.1.1; las demás no tienen esa excepción.

### 5.2 Aislamiento: dos enfoques

1. **Helper SQL `is_tenant_member(tenant_id)` / `tenant_role(tenant_id)`**, `SECURITY DEFINER`, `search_path = ''`, que consultan `tenant_members` con `(select auth.uid())`. *Recomendado.* Ventaja: un cambio de rol/baja **se aplica al instante**. Costo: un lookup por consulta (se amortiza con el índice `(user_id, tenant_id)` y la evaluación única `(select ...)`).
2. **Claims en el JWT** (Custom Access Token Hook con `tenant_ids`/rol). Ventaja: cero lookups. Desventaja: el cambio de rol no surte efecto hasta que expira el token, y un token filtrado conserva permisos. Se descarta para operaciones sensibles; podría usarse como *optimización de lectura* en fase 2.

### 5.3 Políticas (patrón)

- **RLS activo y "denegar por defecto" en todas las tablas** (`enable` + sin política = sin acceso).
- Tablas de negocio: `SELECT/INSERT/UPDATE/DELETE` solo `TO authenticated` con `using (is_tenant_member(tenant_id))`; **`WITH CHECK` siempre**, para impedir mover filas a otro tenant cambiando `tenant_id`.
- **Credenciales Meta** (`tenant_whatsapp_accounts`): solo `owner`, y los tokens **nunca se leen por API**: están en Vault y solo el servidor los resuelve. La UI ve únicamente "conectado / último chequeo".
- **`orders.status`, `payment_proofs.status`**: sin `UPDATE` directo para `authenticated`; solo RPC `SECURITY DEFINER` (`advance_order`, `review_proof`) que validan rol, transición y escriben historial + auditoría. (RLS decide filas, no columnas; por eso `GRANT UPDATE` por columna y RPC, como en Tax Pro.)
- **`messages`, `webhook_events`, `customers`, `conversation_sessions`**: escribe el **servidor** (webhook con service role); los miembros solo leen sus filas, y los operadores escriben mensajes vía RPC que valida que la sesión esté en `human` y asignada a ellos.
- **`audit_logs`**: `REVOKE INSERT/UPDATE/DELETE` a `authenticated`; solo `log_audit()` (service role) o triggers; lectura solo `owner`. Nunca guardar teléfonos completos ni comprobantes en `details`.
- **Funciones `SECURITY DEFINER`**: `SET search_path = ''`, nombres calificados, validan `auth.uid()` y rol dentro, `REVOKE EXECUTE ... FROM public, anon`, `GRANT` mínimo.
- **Storage**: buckets **privados** (`payment-proofs`, `product-images` si se quiere privado, `branding`) **sin política SELECT** para usuarios; ruta `{tenant_id}/{order_id}/...`; los archivos se sirven **solo** por `/api/files/{kind}/{id}`, que autoriza por sesión+tenant, transmite desde el servidor, `Cache-Control: no-store`, y audita cada apertura de comprobante. No autorizado ⇒ siempre el mismo 404.
- Prueba obligatoria por migración: usuario A de tenant 1 **no** puede leer ni escribir nada del tenant 2, ni cambiar su propio rol, ni saltarse la secuencia de estados.

### 5.4 Prácticas heredadas de Tax Pro (a replicar en la app)

- `getClaims()`/`getUser()` en servidor, **nunca** `getSession()` para decidir acceso.
- Toda Server Action: Zod + re-verificar sesión, rol y tenant. Los layouts no protegen las acciones.
- `proxy.ts` (Next 16): solo refresca sesión y redirige; `next` validado (`safeNextPath`).
- Rate limit propio (`auth_rate_limits`): login 5/15 min por email y 30 por IP; OTP 5/15 min; envío de códigos 5/h; registro 10/h por IP; falla cerrado.
- Contraseña ≥12 caracteres + protección contra contraseñas filtradas; error de login genérico; recuperación de contraseña por código con cookie httpOnly.
- Cabeceras globales: `X-Frame-Options: DENY`, CSP (`frame-ancestors 'none'`…), `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS.
- Variables validadas con Zod (`lib/env.ts`, `lib/env.server.ts`); sin `localhost` fijo; sin disco.
- **Específico del webhook de Meta:** verificar la firma `X-Hub-Signature-256` (HMAC-SHA256 con el *app secret* de la **única app de Meta de la plataforma**, guardado como variable de entorno del servidor; comparación en tiempo constante) **antes** de tocar la base; es la autenticación del webhook, no hay sesión.
- Cuenta de tenant `suspended` ⇒ el bot deja de responder y el panel muestra aviso (análogo a `/account-disabled`).

---

## 6. Dashboard y login (alineados a Tax Pro)

- **Login/registro/recuperar contraseña:** tarjeta `rounded-3xl` split-screen 50/50 (formulario a la izquierda, panel visual a la derecha, oculto en < lg), botón negro de ancho completo, error genérico, OTP de 6 casillas por email. **Se elimina** el paso de verificación por SMS y el campo de teléfono/estado del registro; el registro pide nombre, apellido, email, contraseña y nombre del comercio.
- **Layout autenticado:** riel lateral de 80 px (Home · Orders · Catalog · Chats · Settings; abajo campana y avatar), contenido en panel blanco redondeado sobre canvas con cuadrícula de puntos; `BottomNav` en móvil. Paleta negro + lima (`#d4f269`), Geist, radios de 8 px, light mode.
- **Home:** hero con degradado + accesos rápidos + "Continue working" (pedidos pendientes de comprobante).
- **Orders (Kanban):** 4 columnas (Pending · Approved · On the way · Delivered) con Realtime; revisar comprobante en panel lateral; confirmaciones con `ConfirmDialog`.
- **Settings:** Perfil, Seguridad/sesiones, WhatsApp (credenciales), Branding, Pagos, Equipo.
- **Stack idéntico:** Next 16 + React 19 + TS strict + Tailwind v4 + shadcn + RHF/Zod + `@supabase/ssr`. No se incluye Stripe (el cobro de pedidos es manual por comprobante). UI en inglés, código en inglés, comentarios en español.

---

## 7. Riesgos, trade-offs globales y preguntas abiertas

**Trade-offs principales:** (a) esquema compartido = simple pero depende 100 % de RLS bien probada; (b) snapshots = duplicación intencional a cambio de integridad contable; (c) FSM en tabla + transiciones en SQL = robusto frente a concurrencia pero menos flexible que código; (d) webhook asíncrono = fiable pero exige cola/cron; (e) `jsonb` solo en datos efímeros/config para no perder integridad.

**Riesgos:** límites de la API de Meta (ventana de 24 h, 3 botones, 10 filas de lista, plantillas aprobadas para mensajes fuera de ventana); tokens de Meta caducados (necesita estado y alertas); almacenamiento de datos personales de clientes finales (considerar retención y supresión).

**Preguntas que cambian el diseño (necesito tu decisión):**
1. ~~¿Existe un administrador de la plataforma?~~ **Resuelta:** hay `platform_admin` (auditoría de solo lectura) y `developer` (acceso total); ver 5.1.
2. ¿Un usuario puede pertenecer a **varios comercios** (N:M, como se propone) o solo a uno (1:N, más simple)?
3. ¿Se agrega el estado **`cancelled`** al Kanban (recomendado)?
4. ¿Monedas por comercio: solo una base (USD) o precios en USD con pago en VES/USDT a tasa del día (requiere tabla de tasas)?
5. ¿Variantes/opciones de producto (tallas, adicionales de restaurante) entran en la primera fase?
6. ¿El **operador** puede editar catálogo y menús, o solo operar pedidos y chats?
7. **Nombre de la marca:** el logo se copia de Tax Pro, pero ¿qué nombre va junto a él en lugar de "Tax Pro"?

---

## 8. Identidad visual (idéntica a Tax Pro)

Se copia tal cual, sin rediseñar:

| Elemento | Qué se reutiliza |
|---|---|
| **Iconos** | `lucide-react`, mismo estilo de trazo, 20 px en el riel, dentro de la píldora `h-9 w-12` con la etiqueta de 11 px debajo. Iconos de Tax Pro que se conservan: `House` (Home), `Users`/`UsersRound`, `BarChart3` (Reports), `Headset` (soporte), `ShieldCheck`, campana de notificaciones. Nuevos para esta app, mismo set: `ClipboardList` (Orders), `MessageCircle` (Chats), `Store`/`Package` (Catalog), `Settings`. |
| **Colores** | Tokens de `app/globals.css`: negro `#000` (botón primario, riel activo en lima), lima `#d4f269` solo como relleno con texto negro, canvas `#F8F9FA`, superficie `#FFF`, borde `#E5E7EB`, texto `#111827`/`#6B7280`, estados success/warning/danger. Prohibidos azul y hex sueltos. |
| **Radio** | `--radius: 8px` en todo (botones, tarjetas, inputs, modales); `rounded-full` solo en avatares, insignias y círculos de accesos rápidos; panel de contenido junto al riel con `md:rounded-[18px]`; login con tarjeta `rounded-3xl`. |
| **Logo** | Mismo componente `Logo` (marca + nombre, `size-8`, `rounded-lg`) con `withName={false}` en el riel. **Ojo:** en Tax Pro la imagen se carga desde una URL externa (`keenthemes.com`). En esta app el SVG se **descarga una vez a `/public`** y se sirve local: así no dependemos de un tercero, funciona con una CSP estricta y no filtra la IP del usuario. Solo cambia el texto del nombre (ver pregunta abajo). |
| **Tipografía y fondo** | Geist (`next/font`), `bg-dot-grid`, hero con degradado lima → blanco en Home, light mode únicamente. |
| **Feedback** | `Alert` en línea y `ConfirmDialog`; sin toasts flotantes. |

El mismo `/ui-kit` (solo desarrollo) sirve de catálogo para comprobar que ningún componente se sale de la paleta.

## 9. Decisiones confirmadas (plataforma multi-comercio con suscripción)

**Modelo:** una plataforma, varios comercios (el diseño multi-tenant de las secciones 1–6 se mantiene). El dueño se **registra solo** (email + contraseña + OTP por email, sin teléfono), configura su comercio y **debe pagar una suscripción** para operar. Misma interfaz que Tax Pro, lógica de negocio distinta.

### 9.1 Cómo llegan los mensajes a cada comercio (WhatsApp Cloud API)

- **Una sola app de Meta** (la de la plataforma) y **un solo webhook** (`/api/webhooks/whatsapp`) para todos los comercios. No hay un webhook por comercio.
- **Cada comercio necesita su propio número de WhatsApp Business** (su WABA y su `phone_number_id`): el cliente final escribe a *ese* número. Dos comercios no pueden compartir número.
- **Enrutamiento:** cada evento de Meta trae `metadata.phone_number_id`; con `UNIQUE (phone_number_id)` se obtiene el tenant (ver sección 4). La firma `X-Hub-Signature-256` se verifica con **un único app secret** (variable de entorno), lo que simplifica la seguridad: ya no hay un secreto por comercio.
- **Credenciales por comercio:** solo su `waba_id`, `phone_number_id` y un **token de acceso** (cifrado en Supabase Vault, nunca visible por API). Se obtienen de dos maneras:
  1. **Embedded Signup (recomendado para producción):** el dueño pulsa "Connect WhatsApp" en Settings, inicia sesión con Facebook, elige o crea su número y Meta devuelve el WABA y el token a la plataforma. Cero configuración técnica para el comercio. Requiere que la plataforma sea **Tech Provider** de Meta (verificación del negocio y revisión de la app).
  2. **Manual (MVP / desarrollo):** el dueño o tú crean un *System User token* de larga duración y pegan `waba_id`, `phone_number_id` y el token. Funciona sin aprobación de Meta, pero es técnico para el comercio.
- **Costos de Meta:** las conversaciones se facturan al método de pago del WABA de cada comercio, no a la plataforma. Conviene decirlo al comercio al conectarse.
- **Aviso:** los requisitos y plazos de Embedded Signup y Tech Provider los verifico contra la documentación vigente de Meta antes de implementarlo.

### 9.2 Suscripción (Stripe, como en Tax Pro)

- **Reutiliza** `lib/stripe/*`, el flujo Checkout en ventana aparte, el Customer Portal, el webhook idempotente (`stripe_events`) y los renovaciones en la misma fecha. La suscripción pertenece al **tenant**, no al usuario: `tenant_subscriptions` (+ `payments`, `stripe_events`).
- **Cuentas Stripe:** se usarán las mismas credenciales de Tax Pro (en test). Para no mezclar datos: productos con `metadata.app = <nombre-del-bot>`, `lookup_key` con prefijo propio y un **endpoint de webhook propio con su propio secreto**. Para producción recomiendo una cuenta separada.
- **Planes razonables (propuesta a validar con el mercado):**

| Plan | Mensual | Incluye |
|---|---|---|
| Starter | $19 | 1 número, 2 usuarios, hasta 300 pedidos/mes |
| Pro | $49 | 1 número, 5 usuarios, hasta 1.500 pedidos/mes, asesor humano con chat |
| Business | $99 | Pedidos ilimitados, usuarios ilimitados, reportes |

  Los límites se miden en **pedidos**, no en mensajes (el comercio entiende ventas, no tráfico) y se guardan en una tabla `plans` (límites como datos, no en código). Descuento anual ~17%.
- **Bloqueo por falta de pago:** `active` ⇒ todo funciona. `past_due` ⇒ gracia de 7 días con aviso. `canceled`/`unpaid`/sin suscripción ⇒ el bot **deja de responder pedidos** (responde un aviso breve al cliente) y el panel queda en solo lectura con CTA a Billing. **Los datos se conservan.** Se aplica en el servidor del webhook y en RLS/RPC (función `tenant_is_billable(tenant_id)`), no solo en la interfaz.
- **Orden de uso (confirmado):** el dueño se registra y **configura todo gratis** (comercio, WhatsApp, catálogo, menús, métodos de pago, textos del bot). **Pagar la suscripción desbloquea tres cosas:**
  1. **Invitar operadores** (hasta el límite de usuarios de su plan).
  2. **Activar el bot** para que responda a los clientes.
  3. **Gestionar pedidos y mensajes** (Kanban, revisión de comprobantes, chat con asesor).
- **Dónde se exige (nunca solo en la interfaz):**
  - **Base de datos:** la RPC `invite_operator` y la aceptación de invitaciones exigen `tenant_is_billable(tenant_id)` y el cupo del plan (`count(miembros activos) < plans.max_users`). Las RPC `advance_order` y `review_proof`, y las políticas de escritura sobre pedidos y mensajes, exigen lo mismo.
  - **Servidor:** cada Server Action revalida sesión, rol del miembro y suscripción; el webhook de WhatsApp registra el mensaje pero no responde si el comercio no es facturable.
  - **Interfaz:** un `SubscriptionGate` (equivalente al `VerificationGate` de Tax Pro) muestra checklist "Configuración lista → Suscripción → Invitar equipo" y el botón a Billing; Orders, Chats y Team aparecen bloqueados.
- **Si deja de pagar:** los operadores existentes **no se borran**, pero quedan **suspendidos** (no pueden entrar a pedidos ni chats) hasta reactivar; el dueño sigue entrando a Settings y Billing. Al reactivarse, todo vuelve como estaba. Las invitaciones pendientes no se pueden aceptar mientras tanto.
- **Trade-off:** bloquear a los operadores al impagar presiona al comercio a regularizar, pero un cobro fallido temporal (tarjeta vencida) no debe paralizar la venta: por eso los 7 días de gracia en `past_due`.

### 9.3 Adaptación a panadería, restaurante o empresa de productos

Una fila de configuración por comercio (`tenant_settings`), no código distinto: `business_type`, terminología ("Menu"/"Catalog"), modalidades de entrega (domicilio, retiro), campos opcionales de producto y textos del bot. Cada tipo arranca de una plantilla (menús y mensajes de ejemplo). El inventario queda fuera de alcance.

---
## 10. Mensajes estándar y guía de configuración (el usuario nunca se siente perdido)

### 10.1 Mensajes estándar editables

El dueño no parte de una página en blanco: cada mensaje del bot viene **prellenado con un texto de ejemplo** según su tipo de comercio, que puede editar o usar como guía.

**Modelo de datos (dos capas, 3FN):**
- `message_template_defaults` (catálogo global de la plataforma, solo lectura para los comercios): `key` (p. ej. `welcome`, `menu_prompt`, `cart_summary`, `ask_address`, `ask_notes`, `payment_instructions`, `ask_proof`, `proof_received`, `order_approved`, `order_on_the_way`, `order_delivered`, `handoff_to_agent`, `out_of_hours`, `shop_paused`), `business_type`, `locale`, `body`, `allowed_placeholders text[]`, `description` (qué hace y cuándo se envía), `sort_order`. UNIQUE `(key, business_type, locale)`.
- `tenant_messages` (override por comercio): `tenant_id`, `key`, `body`, `is_enabled`, `updated_by`, `updated_at`. PK `(tenant_id, key)`. **Si no existe fila, el bot usa el texto por defecto**: así los textos nuevos de la plataforma llegan a todos sin migrar datos. Restaurar = borrar la fila ("Reset to default").
- **Placeholders** con llaves, p. ej. `{customer_name}`, `{business_name}`, `{order_number}`, `{items}`, `{total}`, `{currency}`, `{payment_details}`, `{delivery_address}`, `{eta}`. Cada plantilla declara cuáles permite.
- **Validación en el servidor (Zod) y en la base:** solo placeholders de `allowed_placeholders` (uno desconocido se rechaza con un mensaje claro), longitud máxima (los textos de WhatsApp tienen límite: 1.024 caracteres en botones/listas con cuerpo, 4.096 en texto), y los **obligatorios** no se pueden quitar (p. ej. `{payment_details}` en `payment_instructions`; sin él el cliente no sabría a dónde pagar).
- **Seguridad:** el texto se trata como texto plano (sin HTML) y los valores de los placeholders se insertan escapados; nunca se evalúa código del comercio.
- **Distinción importante:** estos son mensajes dentro de la ventana de 24 h. Los mensajes fuera de ventana (p. ej. avisar de un pedido tras 24 h) requieren **plantillas aprobadas por Meta**; se registran aparte (`whatsapp_templates`, con su estado de aprobación) y quedan para fase 2.

**Interfaz (Settings → Bot messages):** lista agrupada por etapa del flujo (Bienvenida · Menú · Carrito · Dirección · Pago · Estado del pedido · Asesor), editor con **vista previa tipo burbuja de WhatsApp** con datos de ejemplo, botones para insertar placeholders, contador de caracteres, "Use suggested text" y "Reset to default". Los textos con placeholders sin completar (p. ej. `[tu horario]`) muestran una marca de "Needs your info" hasta editarlos.

### 10.2 Guía de configuración paso a paso (onboarding)

Reutiliza el patrón de formulario por pasos de Tax Pro (`ProgressRing`, `CurrentStepCard`, `StepDescription` en la columna derecha; stepper horizontal en móvil).

**Pasos, en orden, con dependencias:**

| # | Paso | Qué se pide | Por qué se explica |
|---|---|---|---|
| 1 | Perfil del comercio | Nombre, tipo de negocio, zona horaria, moneda | Define plantillas y terminología |
| 2 | Marca | Logo, color, nombre visible | Identidad en la app |
| 3 | Conectar WhatsApp | Número y credenciales (manual o Embedded Signup) | Sin esto el bot no existe |
| 4 | Métodos de pago | Pago Móvil, Zelle, transferencia, USDT… | El bot los presenta al cobrar |
| 5 | Catálogo / Menú | Categorías y productos (con plantilla de ejemplo) | Lo que el cliente ve |
| 6 | Menús del bot | Botones y listas (se genera un menú base desde el catálogo) | Cómo navega el cliente |
| 7 | Mensajes del bot | Revisar los textos estándar (sección 10.1) | Tono y datos del comercio |
| 8 | Probar el bot | Simulador dentro del panel y mensaje de prueba real a un número propio | Confirmar que todo funciona antes de salir |
| 9 | **Suscripción** | Elegir plan y pagar | Desbloquea bot, equipo y pedidos |
| 10 | Invitar equipo | Operadores por email | Requiere suscripción activa |
| 11 | Activar el bot | Interruptor "Go live" con checklist final | Evita publicar a medias |

**Cómo se modela:** el progreso **se calcula, no se guarda a mano**: una función `get_onboarding_status()` (parte de `get_my_workspace()`) revisa si existen los datos reales de cada paso (¿hay WhatsApp conectado? ¿al menos un método de pago activo? ¿al menos un producto? ¿mensajes obligatorios completos?) y devuelve `{step, done, blocked_by}`. Una sola columna `tenants.go_live_at` registra la activación. Así el progreso nunca se desincroniza con la realidad.

**Principios de guía en toda la app:**
- **Siguiente paso siempre visible:** tarjeta "Continue setup" en Home con el paso pendiente y el avance (%).
- **Pasos bloqueados explicados:** nunca un botón gris sin motivo; texto "Connect WhatsApp first" con enlace al paso.
- **Estados vacíos útiles:** cada lista vacía (productos, pedidos, operadores) explica qué es y ofrece la acción principal y, si aplica, "Add sample data" con productos de ejemplo del tipo de negocio.
- **Ayuda en contexto:** texto corto "Por qué te pedimos esto" bajo cada sección y enlaces a una guía breve (por ejemplo, cómo obtener el token de Meta, con capturas).
- **Validación amable:** errores en línea con la acción para corregir (no códigos técnicos de Meta; se traducen: "Token expirado: vuelve a conectar WhatsApp").
- **Salud de la conexión:** indicador "WhatsApp: conectado / token vencido" con alerta en el dashboard y notificación si falla.
- **Avisos del flujo de pago:** antes de pagar, resumen de lo que se desbloquea; después, pantalla "Plan activo" que lleva directo a "Invitar equipo".
- **Idioma:** UI en inglés, como en Tax Pro; los textos por defecto del bot se ofrecen en el idioma del comercio (`locale`, español para el mercado inicial).

**Trade-offs:** (a) plantillas globales + override mantienen los textos actualizables sin migrar, pero exigen resolver "override o default" en cada envío (se cachea por comercio); (b) calcular el progreso desde datos reales evita estados falsos, a costa de una función con varias comprobaciones (una sola llamada por petición); (c) el simulador y la prueba real cuestan trabajo extra, pero son lo que más reduce el "no sé si funciona".

---
## 11. Catálogo público con publicaciones (tienda en `empresa.dominio.com`)

**Idea:** en lugar de que el bot envíe el catálogo como texto, el dueño crea **publicaciones** (colecciones de productos con tarjetas: foto, nombre, precio, descripción). Cada publicación vive en una página pública con el dominio de la app y el **subdominio = nombre de la empresa**, p. ej. `panaderia-luna.tuapp.com`. El bot manda un mensaje corto con la imagen de portada y el enlace; el cliente mira las tarjetas y pulsa "Pedir por WhatsApp" para volver al chat.

**Modelo de datos (nuevas tablas, 3FN):**
- `catalog_publications`: `id`, `tenant_id`, `title`, `description`, `cover_path` (Storage), `status` (`draft` | `published`), `published_at`, `created_by`, `created_at`. UNIQUE `(tenant_id, id)`.
- `catalog_publication_items`: PK `(publication_id, product_id)`, `sort_order`; FK compuestas con `tenant_id` (una publicación no puede incluir productos de otro comercio, igual que `bot_menu_items`).
- El subdominio ya existe: es `tenants.slug` (único, solo `a-z0-9-`). Se agrega una lista de **subdominios reservados** (`www`, `app`, `api`, `admin`, `mail`, `static`…) que `create_tenant` rechaza, y el slug **no cambia** una vez publicado (se rompería cada enlace compartido).

**Lectura pública sin abrir las tablas:** `anon` no recibe ningún permiso sobre las tablas. La página consume funciones `SECURITY DEFINER` de solo lectura (`get_public_storefront(slug)`, `get_public_publication(slug, id)`) que devuelven **solo campos seguros** (nombre, precio, foto, descripción, nombre del comercio, WhatsApp de contacto) y **solo de publicaciones `published` de comercios activos**. Nunca ids internos de clientes, costos ni datos de pedidos. Si el comercio dejó de pagar, la página muestra "Temporarily unavailable".

**Imágenes:** es la única excepción a "archivos siempre privados". Los productos de una publicación publicada se sirven por una ruta pública controlada (`/api/public-files/product/{id}`) que **solo responde si el producto está en una publicación publicada**; el resto sigue privado. Se cachean (no contienen datos personales).

**Subdominios:** DNS comodín `*.tuapp.com` y el `proxy.ts` de Next lee el `Host`, extrae el subdominio y reescribe a la página de la tienda; en local se prueba con `empresa.localhost:3000`. Requiere comprar el dominio y un certificado comodín (Vercel lo soporta).

**Pedido desde la tienda web (decisión confirmada):** el cliente arma su pedido en la página (elige productos y cantidades) y al enviarlo **el pedido aparece en la conversación de WhatsApp**, donde continúa el flujo (confirmar, dirección, notas, pago y comprobante). El **estado del pedido (Aprobado → En camino → Entregado) solo empieza a mostrarse y a avisarse al cliente cuando ya pagó** (comprobante recibido).

*Cómo se vincula una visita anónima con un cliente de WhatsApp (sin que escriba datos personales en la web):*
- El bot genera un **enlace personal de un solo uso** `empresa.tuapp.com/c/{publicación}?t={token}` y lo envía por el chat. La tabla `web_order_links` guarda `session_id`, el **hash** del token (nunca el token), `expires_at` (24 h, igual que la ventana de Meta) y `submitted_at`. El token no contiene datos personales.
- La identidad del cliente sale **de la sesión de WhatsApp**, no de la web. Sin token, la página es solo de consulta y el botón "Pedir por WhatsApp" abre el chat (`wa.me/<número>?text=<código>`) para que el bot envíe su enlace personal.
- Al pulsar "Enviar pedido", un Server Action (Zod + límite de intentos por IP y token) llama a una función solo para la service role, `submit_web_order(token, items)`, que valida el token, que el comercio esté facturable y con el bot activo, que cada producto pertenezca a la publicación y esté disponible, y cantidades 1–999; **re-precia en el servidor** (nunca confía en precios del navegador), reemplaza el carrito de la sesión y pasa la conversación a "esperando confirmación". El bot responde en el chat con el resumen (`cart_summary`) y la conversación sigue como ya está diseñada.

*Cambio en el ciclo del pedido (confirmado; aplicado en las migraciones 0008 y 0009):* para que el pedido no "empiece" hasta que se pague, se agrega el estado **`awaiting_payment`** antes de `pending`:
`awaiting_payment` → `pending` (comprobante recibido, validación) → `approved` → `on_the_way` → `delivered`; `cancelled` desde cualquiera salvo los dos últimos.
- Al confirmar el carrito el pedido se crea en `awaiting_payment` (con su número, para las instrucciones de pago). **No aparece en el Kanban** (los 4 estados del tablero siguen siendo Pendiente, Aprobado, En camino, Entregado); se ve en una bandeja "Sin pagar".
- Al llegar el comprobante, el pedido pasa a `pending` y **recién entonces** se notifica a los operadores y se muestra en el Kanban.
- Un pedido sin pagar vence y se cancela automáticamente tras N horas (motivo "Payment timeout").
- Cambios en lo ya aplicado: valor nuevo en el ENUM, `create_order_from_cart` crea en `awaiting_payment`, el trigger de secuencia y el historial lo admiten, la notificación "nuevo pedido" pasa a dispararse al entrar en `pending`, un índice parcial nuevo, y nuevas pruebas.

**Seguridad y rendimiento:** páginas sin sesión ni datos personales, límite de peticiones por IP, cabeceras globales de Tax Pro y metadatos Open Graph para que WhatsApp muestre una vista previa con foto y título. Trade-offs: (a) más superficie pública que revisar, mitigada porque solo hay funciones de lectura con campos fijos; (b) el subdominio exige dominio propio y DNS comodín; (c) una página pública es indexable por buscadores: se ofrece la opción "no indexar".

**Respuestas:** (1) Aún sin dominio: desarrollo con `empresa.localhost:3000` y el dominio real por variable de entorno. (2) Fotos: se asume públicas solo para productos publicados (supuesto; sin confirmar). (3) Solo tarjetas en el MVP, sin página de detalle.

---
## 12. Horario de atención (implementado en la migración 0011)

- **Configuración:** en Settings el dueño elige los días que atiende (de lunes a domingo, o los que quiera) y la hora de apertura y cierre de cada uno. Atajos de la interfaz: "Lunes a domingo", "Lunes a viernes" y "Personalizado". Si no configura nada, el comercio se considera **abierto 24 horas**.
- **Datos:** `tenant_business_hours` (un día por fila, `weekday` ISO 1 = lunes … 7 = domingo, `is_open`, `opens_at`, `closes_at`) y `tenant_settings.hours_enabled`. La zona horaria del comercio (`tenant_settings.timezone`, validada contra los nombres IANA) manda en todos los cálculos.
- **Turnos nocturnos:** si el cierre es menor que la apertura (p. ej. viernes 18:00–02:00) el turno cruza la medianoche; el sábado a la 01:00 sigue abierto. La hora de cierre es exclusiva.
- **Guardado atómico:** solo la función `set_business_hours` (dueño) escribe los 7 días de una vez; no hay escritura directa. Rechaza semanas incompletas, días repetidos, `abre = cierra`, horas inválidas y activar un horario sin ningún día abierto.
- **El bot:** consulta `get_open_status`, que devuelve datos estructurados (`is_open`, hora de cierre actual, próxima apertura con día y horas). Fuera de horario responde con el mensaje `out_of_hours`, que la app completa con los placeholders `{schedule}` (resumen semanal), `{next_open}` ("mañana a las 09:00"), `{opening_time}` y `{closing_time}`; el texto en español lo arma la app, no la base. El mensaje `business_info` también puede usar `{schedule}`.
- **Pedidos fuera de horario:** la base los rechaza con `OUTSIDE_HOURS` (al crear el pedido y al enviar el pedido desde la tienda web). Un cliente que ya confirmó antes del cierre puede pagar después: el pedido ya existe.
- **Guía:** nuevo paso opcional "Business hours" en la configuración inicial.
- **Fuera de alcance por ahora:** feriados y cierres puntuales ("hoy cerramos temprano") y varios turnos por día (mañana y tarde). Son extensiones naturales con una tabla de excepciones por fecha.

---
## 13. Ubicación GPS para el delivery (implementado en las migraciones 0013 y 0014)

- **Flujo:** al elegir "delivery" el bot manda el mensaje interactivo de WhatsApp para pedir la ubicación (botón "Enviar ubicación"); el cliente responde con un mensaje de tipo `location` (latitud y longitud). Después el bot pide una referencia en texto y las notas. El retiro en local no pide ubicación.
- **Estado nuevo de la conversación:** `awaiting_location`. Secuencia: confirmación → ubicación → referencia → notas → pago.
- **Datos:** `orders.delivery_lat/delivery_lng` (inmutables, con el resto del pedido) y `customer_addresses.lat/lng`. Siempre las dos coordenadas o ninguna, dentro de rango.
- **Regla del comercio:** `tenant_settings.require_delivery_location` (por defecto **sí**). Con GPS obligatorio un pedido de delivery sin coordenadas se rechaza (`LOCATION_REQUIRED`); si el dueño lo hace opcional basta con la dirección escrita.
- **Privacidad:** la ubicación es un dato personal sensible. Solo la ven el dueño y los operadores con suscripción vigente (como el resto del pedido); el administrador del SaaS no, y nunca va a logs, auditoría ni URLs de la app. El operador la abre en el mapa desde el panel.
- **Mensajes editables:** `ask_location`, `location_received`, `location_invalid`.
- **Pendiente (fase posterior):** zonas o radio de cobertura y costo de envío por distancia; retención o anonimización de coordenadas pasado un plazo.

---
*Siguiente paso tras tu aprobación: (1) migraciones SQL comentadas + pruebas RLS, (2) esqueleto Next.js con login/dashboard estilo Tax Pro, (3) handler del webhook de Meta con firma e idempotencia.*
