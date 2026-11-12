/**
 * Webhook de WhatsApp Cloud API (UNA sola URL para todos los comercios).
 *
 * GET  → verificación de Meta al registrar el webhook (hub.mode / hub.verify_token / hub.challenge).
 * POST → eventos: mensajes de clientes y estados de mensajes enviados.
 *
 * Seguridad (no hay sesión: la firma ES la autenticación):
 *   1. Se lee el cuerpo CRUDO (máx. 1 MB) y se verifica X-Hub-Signature-256 con el app secret ANTES de
 *      tocar la base de datos. Firma inválida → 401 sin procesar nada.
 *   2. Todos los eventos de la petición entran a la COLA (webhook_events) en UN solo viaje a la base
 *      (ingest_webhook_events): resuelve el comercio por phone_number_id, ignora números desconocidos y descarta
 *      los reintentos de Meta por la llave única (idempotencia).
 *   3. Se responde 200 enseguida (Meta reintenta si tardamos, y eso crearía duplicados). Después, en segundo
 *      plano (after), esta misma instancia vacía la cola un rato acotado; lo que quede o falle lo retoma el
 *      trabajador programado (/api/jobs/webhooks) con reintentos y espera exponencial. Si la base falla al
 *      guardar se responde 500 y Meta reintenta: ningún mensaje se pierde.
 * Sin las variables META_* configuradas responde 503 (falla cerrado).
 * Nota: no se exporta `runtime` (con cacheComponents Next 16 lo rechaza); corre en Node.js por defecto.
 */
import { after, NextResponse, type NextRequest } from "next/server";
import type { Json } from "@/types/database";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env.server";
import { eventKey, extractEvents, webhookPayloadSchema } from "@/lib/whatsapp/payload";
import { safeEqual, verifySignature } from "@/lib/whatsapp/signature";
import { drainWebhookQueue } from "@/features/whatsapp/queue";

const MAX_BODY_BYTES = 1_000_000;
/** Tiempo que esta instancia dedica a vaciar la cola después de responder (bajo el límite de la función). */
const DRAIN_BUDGET_MS = 20_000;
export const maxDuration = 30;

/** Verificación del webhook (Meta llama con GET al registrarlo). */
export async function GET(request: NextRequest) {
  const { META_WEBHOOK_VERIFY_TOKEN } = getServerEnv();
  if (!META_WEBHOOK_VERIFY_TOKEN) return new NextResponse("Not configured", { status: 503 });

  const params = request.nextUrl.searchParams;
  const challenge = params.get("hub.challenge") ?? "";
  const tokenOk = safeEqual(params.get("hub.verify_token") ?? "", META_WEBHOOK_VERIFY_TOKEN);
  // El challenge se devuelve tal cual, pero solo si es un valor simple (no se refleja contenido arbitrario).
  if (params.get("hub.mode") === "subscribe" && tokenOk && /^[\w-]{1,200}$/.test(challenge)) {
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  const { META_APP_SECRET } = getServerEnv();
  if (!META_APP_SECRET) return new NextResponse("Not configured", { status: 503 });

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return new NextResponse("Too large", { status: 413 });
  const raw = Buffer.from(await request.arrayBuffer());
  if (raw.length > MAX_BODY_BYTES) return new NextResponse("Too large", { status: 413 });

  // 1) Autenticación del webhook: firma HMAC sobre los bytes originales.
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"), META_APP_SECRET)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(raw.toString("utf8"));
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }
  const parsed = webhookPayloadSchema.safeParse(json);
  if (!parsed.success) return new NextResponse("ok", { status: 200 }); // otro tipo de aviso de Meta: se ignora

  const events = extractEvents(parsed.data);
  if (events.length === 0) return new NextResponse("ok", { status: 200 });

  const admin = createAdminClient();

  // 2) Encolar (un solo viaje a la base). Si falla, 500: Meta reintenta y no se pierde nada.
  const payload = events.map((event) => ({ phone_number_id: event.phoneNumberId, event_key: eventKey(event), payload: event }));
  const { data: queued, error } = await admin.rpc("ingest_webhook_events", { p_events: payload as unknown as Json });
  if (error) {
    console.error(`[whatsapp] No se pudo encolar el webhook: ${error.code ?? "?"}`);
    return new NextResponse("Unavailable", { status: 500 });
  }

  // 3) Responder ya; procesar en segundo plano con tiempo acotado.
  if ((queued ?? 0) > 0 && getServerEnv().WEBHOOK_DRAIN_ON_RECEIVE === "1") {
    after(async () => {
      await drainWebhookQueue(admin, { budgetMs: DRAIN_BUDGET_MS });
    });
  }
  return new NextResponse("ok", { status: 200 });
}
