/**
 * Cliente de la API de WhatsApp Cloud (Graph API de Meta): enviar mensajes y descargar medios.
 *
 * Qué hace:
 *   - sendMessage(): arma el JSON con buildPayload() (lib/whatsapp/outbound-payload.ts) y lo envía con el token del comercio. En desarrollo, WHATSAPP_DRY_RUN=1 no llama
 *     a Meta y devuelve un id simulado (ignorado en producción).
 *   - downloadMedia(): baja la imagen/PDF de un comprobante.
 * Seguridad: el token solo existe en memoria del servidor; los errores NUNCA lo incluyen. La URL del
 * medio la entrega Meta, pero se exige https y un dominio de Meta antes de pedirla (anti SSRF), con
 * tamaño máximo de 10 MB y tipos permitidos.
 * Quién lo usa: features/whatsapp/*.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { getServerEnv } from "@/lib/env.server";
import { buildPayload, type OutboundContent } from "@/lib/whatsapp/outbound-payload";

export type { OutboundContent };

export class WhatsAppApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: number | null,
  ) {
    super(`WhatsApp API error (HTTP ${status}${code ? `, code ${code}` : ""})`);
  }
}

type Credentials = { phoneNumberId: string; token: string | null };

/** Envía un mensaje y devuelve su wamid. */
export async function sendMessage(credentials: Credentials, to: string, content: OutboundContent): Promise<{ wamid: string }> {
  const env = getServerEnv();
  // El modo simulado solo existe fuera de producción: en producción siempre se llama a Meta.
  if (env.WHATSAPP_DRY_RUN === "1" && process.env.NODE_ENV !== "production") {
    return { wamid: `dry-run:${randomUUID()}` };
  }
  if (!credentials.token) throw new WhatsAppApiError(401, null);

  const response = await fetch(`https://graph.facebook.com/${env.META_GRAPH_VERSION}/${credentials.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${credentials.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(buildPayload(to, content)),
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await response.json().catch(() => null)) as { messages?: { id?: string }[]; error?: { code?: number } } | null;
  const wamid = json?.messages?.[0]?.id;
  if (!response.ok || !wamid) throw new WhatsAppApiError(response.status, json?.error?.code ?? null);
  return { wamid };
}

const MEDIA_HOSTS = [".fbsbx.com", ".facebook.com", ".fbcdn.net", ".whatsapp.net"];
const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
export const ALLOWED_PROOF_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** Descarga un medio (comprobante) del cliente. Lanza si el tipo o el tamaño no están permitidos. */
export async function downloadMedia(token: string, mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const { META_GRAPH_VERSION } = getServerEnv();
  const headers = { Authorization: `Bearer ${token}` };

  const meta = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(mediaId)}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  const info = (await meta.json().catch(() => null)) as { url?: string; mime_type?: string; file_size?: number } | null;
  if (!meta.ok || !info?.url || !info.mime_type) throw new WhatsAppApiError(meta.status, null);

  const url = new URL(info.url);
  if (url.protocol !== "https:" || !MEDIA_HOSTS.some((host) => url.hostname.endsWith(host))) throw new Error("MEDIA_HOST_NOT_ALLOWED");
  if (!(info.mime_type in ALLOWED_PROOF_MIME)) throw new Error("MEDIA_TYPE_NOT_ALLOWED");
  if ((info.file_size ?? 0) > MAX_MEDIA_BYTES) throw new Error("MEDIA_TOO_LARGE");

  const file = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  if (!file.ok) throw new WhatsAppApiError(file.status, null);
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > MAX_MEDIA_BYTES) throw new Error("MEDIA_TOO_LARGE");
  return { buffer, mimeType: info.mime_type };
}
