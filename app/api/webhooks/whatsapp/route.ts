/**
 * Webhook de WhatsApp Cloud API (UNA sola URL para todos los comercios).
 *
 * GET  → verificación de Meta al registrar el webhook (hub.mode / hub.verify_token / hub.challenge).
 * POST → eventos: mensajes de clientes y estados de mensajes enviados.
 *
 * Seguridad (no hay sesión: la firma ES la autenticación):
 *   1. Se lee el cuerpo CRUDO (máx. 1 MB) y se verifica X-Hub-Signature-256 con el app secret ANTES de
 *      tocar la base de datos. Firma inválida → 401 sin procesar nada.
 *   2. Cada evento se guarda en webhook_events con llave única (wamid): los reintentos de Meta no se
 *      procesan dos veces (idempotencia).
 *   3. Se responde 200 enseguida y el procesamiento sigue en segundo plano (after): Meta reintenta si
 *      tarda, y eso crearía duplicados.
 *   4. El comercio se resuelve por metadata.phone_number_id (índice único); números desconocidos se ignoran.
 * Sin las variables META_* configuradas responde 503 (falla cerrado).
 * Nota: no se exporta `runtime` (con cacheComponents Next 16 lo rechaza); corre en Node.js por defecto.
 */
import { after, NextResponse, type NextRequest } from "next/server";
import type { Json } from "@/types/database";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env.server";
import { eventKey, extractEvents, webhookPayloadSchema } from "@/lib/whatsapp/payload";
import { safeEqual, verifySignature } from "@/lib/whatsapp/signature";
import { processStoredEvent } from "@/features/whatsapp/process-event";

const MAX_BODY_BYTES = 1_000_000;

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

  // 4) Resolver el comercio de cada número de Meta.
  const numbers = [...new Set(events.map((event) => event.phoneNumberId))];
  const { data: accounts, error: accountsError } = await admin
    .from("tenant_whatsapp_accounts")
    .select("tenant_id, phone_number_id")
    .in("phone_number_id", numbers);
  // Si la base falla se responde 500: Meta reintentará y no se pierde el evento.
  if (accountsError) return new NextResponse("Unavailable", { status: 500 });
  const tenantByNumber = new Map((accounts ?? []).map((account) => [account.phone_number_id, account.tenant_id]));

  // 2) Guardar los eventos nuevos (los duplicados se descartan por la llave única).
  const rows = events.flatMap((event) => {
    const tenantId = tenantByNumber.get(event.phoneNumberId);
    return tenantId ? [{ tenant_id: tenantId, event_key: eventKey(event), payload: event as unknown as Json }] : [];
  });
  if (rows.length === 0) return new NextResponse("ok", { status: 200 });

  const { data: inserted, error: insertError } = await admin
    .from("webhook_events")
    .upsert(rows, { onConflict: "event_key", ignoreDuplicates: true })
    .select("id");
  if (insertError) return new NextResponse("Unavailable", { status: 500 });

  // 3) Responder ya; procesar en segundo plano y en orden de llegada.
  const ids = (inserted ?? []).map((row) => row.id);
  if (ids.length > 0) {
    after(async () => {
      for (const id of ids) await processStoredEvent(admin, id);
    });
  }
  return new NextResponse("ok", { status: 200 });
}
