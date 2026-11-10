/**
 * Esquema (Zod) del payload del webhook de Meta y su normalización a eventos propios.
 *
 * Qué hace: valida con tolerancia lo que llega (Meta agrega campos con el tiempo) y lo convierte en
 * eventos simples: mensajes del cliente (texto, respuesta a botón/lista, ubicación, imagen/documento)
 * y actualizaciones de estado de mensajes salientes (sent / delivered / read / failed).
 * Seguridad: el teléfono llega sin "+": se normaliza a E.164 y se descarta si no es válido. Todo lo
 * demás se trata como dato no confiable (se recorta y valida de nuevo donde se usa).
 * Quién lo usa: app/api/webhooks/whatsapp/route.ts y features/whatsapp/process-event.ts.
 */
import { z } from "zod";

const messageSchema = z.object({
  id: z.string().min(1).max(200),
  from: z.string().min(1).max(32),
  type: z.string().max(40),
  text: z.object({ body: z.string() }).optional(),
  interactive: z
    .object({
      type: z.string(),
      button_reply: z.object({ id: z.string(), title: z.string().optional() }).optional(),
      list_reply: z.object({ id: z.string(), title: z.string().optional() }).optional(),
    })
    .optional(),
  button: z.object({ payload: z.string().optional(), text: z.string().optional() }).optional(),
  location: z
    .object({ latitude: z.number(), longitude: z.number(), name: z.string().optional(), address: z.string().optional() })
    .optional(),
  image: z.object({ id: z.string(), mime_type: z.string().optional(), caption: z.string().optional() }).optional(),
  document: z
    .object({ id: z.string(), mime_type: z.string().optional(), filename: z.string().optional(), caption: z.string().optional() })
    .optional(),
});

const statusSchema = z.object({
  id: z.string().min(1).max(200),
  status: z.string().max(40),
  errors: z.array(z.object({ code: z.number().optional() })).optional(),
});

const valueSchema = z.object({
  metadata: z.object({ phone_number_id: z.string().min(1).max(64) }),
  contacts: z.array(z.object({ wa_id: z.string().optional(), profile: z.object({ name: z.string().optional() }).optional() })).optional(),
  messages: z.array(messageSchema).optional(),
  statuses: z.array(statusSchema).optional(),
});

export const webhookPayloadSchema = z.object({
  object: z.string(),
  entry: z.array(z.object({ changes: z.array(z.object({ field: z.string(), value: valueSchema.optional() })) })),
});

/** Contenido de un mensaje del cliente, ya normalizado. */
export type InboundContent =
  | { type: "text"; body: string }
  | { type: "reply"; replyId: string; title: string }
  | { type: "location"; lat: number; lng: number }
  | { type: "media"; mediaKind: "image" | "document"; mediaId: string; mimeType: string; caption: string | null }
  | { type: "other"; rawType: string };

export type InboundEvent =
  | { kind: "message"; phoneNumberId: string; wamid: string; from: string; profileName: string | null; content: InboundContent }
  | { kind: "status"; phoneNumberId: string; wamid: string; status: string; errorCode: number | null };

const E164 = /^\+[1-9]\d{7,14}$/;

/** "584141234567" → "+584141234567"; null si no es un teléfono válido. */
export function toE164(waId: string): string | null {
  const candidate = `+${waId.replace(/\D/g, "")}`;
  return E164.test(candidate) ? candidate : null;
}

type RawMessage = z.infer<typeof messageSchema>;

function normalizeContent(message: RawMessage): InboundContent {
  if (message.type === "text" && message.text) return { type: "text", body: message.text.body };
  if (message.type === "interactive" && message.interactive) {
    const reply = message.interactive.button_reply ?? message.interactive.list_reply;
    if (reply) return { type: "reply", replyId: reply.id, title: reply.title ?? "" };
  }
  // Botones de plantilla (legado): el payload actúa como id de respuesta.
  if (message.type === "button" && message.button?.payload) {
    return { type: "reply", replyId: message.button.payload, title: message.button.text ?? "" };
  }
  if (message.type === "location" && message.location) {
    const { latitude, longitude } = message.location;
    if (latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) return { type: "location", lat: latitude, lng: longitude };
  }
  if (message.type === "image" && message.image) {
    return { type: "media", mediaKind: "image", mediaId: message.image.id, mimeType: message.image.mime_type ?? "", caption: message.image.caption ?? null };
  }
  if (message.type === "document" && message.document) {
    return { type: "media", mediaKind: "document", mediaId: message.document.id, mimeType: message.document.mime_type ?? "", caption: message.document.caption ?? null };
  }
  return { type: "other", rawType: message.type };
}

/** Convierte el payload validado en eventos propios. Descarta mensajes con teléfono inválido. */
export function extractEvents(payload: z.infer<typeof webhookPayloadSchema>): InboundEvent[] {
  const events: InboundEvent[] = [];
  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      if (change.field !== "messages" || !change.value) continue;
      const { metadata, contacts, messages, statuses } = change.value;
      const names = new Map((contacts ?? []).map((contact) => [contact.wa_id ?? "", contact.profile?.name ?? null]));

      for (const message of messages ?? []) {
        const from = toE164(message.from);
        if (!from) continue;
        events.push({
          kind: "message",
          phoneNumberId: metadata.phone_number_id,
          wamid: message.id,
          from,
          profileName: (names.get(message.from) ?? null)?.slice(0, 120) ?? null,
          content: normalizeContent(message),
        });
      }
      for (const status of statuses ?? []) {
        events.push({
          kind: "status",
          phoneNumberId: metadata.phone_number_id,
          wamid: status.id,
          status: status.status,
          errorCode: status.errors?.[0]?.code ?? null,
        });
      }
    }
  }
  return events;
}

/** Llave de idempotencia: el wamid del mensaje, o wamid:estado para las actualizaciones de estado. */
export function eventKey(event: InboundEvent): string {
  return event.kind === "message" ? event.wamid : `${event.wamid}:${event.status}`;
}
