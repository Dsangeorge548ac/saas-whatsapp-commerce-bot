/**
 * Mensajes salientes de WhatsApp: tipos y armado del JSON de la Graph API (funciones puras).
 *
 * Va separado del cliente (que usa `server-only`) para poder probarlo sin red ni Next.
 * Recorta los textos a los límites de WhatsApp: cuerpo 1024 (interactivos) / 4096 (texto), botón 20,
 * título de fila 24, descripción de fila 72; máximo 3 botones y 10 filas.
 */

export type OutboundContent =
  | { kind: "text"; body: string }
  | { kind: "buttons"; body: string; buttons: { id: string; title: string }[] } // máx. 3
  | { kind: "list"; body: string; buttonLabel: string; rows: { id: string; title: string; description?: string }[] } // máx. 10
  | { kind: "location_request"; body: string }
  | { kind: "cta_url"; body: string; label: string; url: string };

const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1)}…`);

/** JSON de Graph API para un mensaje saliente. */
export function buildPayload(to: string, content: OutboundContent) {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to: to.replace(/^\+/, "") };
  switch (content.kind) {
    case "text":
      return { ...base, type: "text", text: { body: clip(content.body, 4096), preview_url: false } };
    case "buttons":
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: clip(content.body, 1024) },
          action: { buttons: content.buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: clip(b.id, 256), title: clip(b.title, 20) } })) },
        },
      };
    case "list":
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "list",
          body: { text: clip(content.body, 1024) },
          action: {
            button: clip(content.buttonLabel, 20),
            sections: [
              {
                title: "Options",
                rows: content.rows.slice(0, 10).map((r) => ({
                  id: clip(r.id, 200),
                  title: clip(r.title, 24),
                  ...(r.description ? { description: clip(r.description, 72) } : {}),
                })),
              },
            ],
          },
        },
      };
    case "location_request":
      return {
        ...base,
        type: "interactive",
        interactive: { type: "location_request_message", body: { text: clip(content.body, 1024) }, action: { name: "send_location" } },
      };
    case "cta_url":
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "cta_url",
          body: { text: clip(content.body, 1024) },
          action: { name: "cta_url", parameters: { display_text: clip(content.label, 20), url: content.url } },
        },
      };
  }
}
