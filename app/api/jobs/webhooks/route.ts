/**
 * Trabajador programado de la cola de webhooks de WhatsApp (cada minuto).
 *
 * Qué hace: vacía la cola `webhook_events` durante ~50 s: reintenta los eventos fallidos cuando vence su espera,
 * retoma los que quedaron a medias (bloqueo caducado) y procesa lo que el webhook no alcanzó. Devuelve solo
 * contadores (sin datos de clientes) y las métricas de la cola para monitoreo.
 * Quién la llama: pg_cron + pg_net (migración 0027) o Vercel Cron, con `Authorization: Bearer <CRON_SECRET>`.
 * Seguridad: sin sesión; la autorización es el secreto (lib/auth/cron.ts). Sin CRON_SECRET responde 503.
 * Se puede ejecutar varias veces en paralelo: la cola usa FOR UPDATE SKIP LOCKED.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authorizeCron } from "@/lib/auth/cron";
import { createAdminClient } from "@/lib/supabase/admin";
import { drainWebhookQueue } from "@/features/whatsapp/queue";

export const maxDuration = 60;
const BUDGET_MS = 50_000;

async function run(request: NextRequest) {
  // Seguridad: solo el programador con el secreto.
  const auth = authorizeCron(request.headers.get("authorization"));
  if (auth === "unconfigured") return new NextResponse("Not configured", { status: 503 });
  if (auth === "denied") return new NextResponse("Unauthorized", { status: 401 });

  const admin = createAdminClient();
  const result = await drainWebhookQueue(admin, { budgetMs: BUDGET_MS, batchSize: 20 });
  const { data: stats } = await admin.rpc("webhook_queue_stats");
  return NextResponse.json({ ...result, queue: stats?.[0] ?? null }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = run;
export const POST = run;
