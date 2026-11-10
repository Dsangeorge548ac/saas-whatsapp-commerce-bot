/**
 * Reglas para que un asesor pueda escribirle a un cliente (funciones puras, se prueban sin red).
 *
 *   - La conversación tiene que estar en modo humano (el bot no responde mientras tanto).
 *   - La tiene que haber tomado ESTE asesor (tomar es atómico: si dos la piden a la vez, gana uno).
 *   - WhatsApp solo permite mensajes libres dentro de las 24 h posteriores al último mensaje del cliente;
 *     pasado ese plazo hace falta una plantilla aprobada por Meta (fase posterior).
 * La interfaz las usa para habilitar o no el redactor y el servidor las vuelve a aplicar antes de enviar.
 */
export type ReplyBlock = "not_human" | "not_assigned" | "window_closed";
export type ReplyCheck = { ok: true } | { ok: false; reason: ReplyBlock };

export type ChatState = { mode: "bot" | "human"; assignedTo: string | null; windowExpiresAt: string | null };

export function canReply(chat: ChatState, userId: string, now: Date = new Date()): ReplyCheck {
  if (chat.mode !== "human") return { ok: false, reason: "not_human" };
  if (chat.assignedTo !== userId) return { ok: false, reason: "not_assigned" };
  if (!chat.windowExpiresAt || new Date(chat.windowExpiresAt) <= now) return { ok: false, reason: "window_closed" };
  return { ok: true };
}

export const REPLY_BLOCK_TEXT: Record<ReplyBlock, string> = {
  not_human: "This conversation is with the bot. Customers who ask for an agent appear here.",
  not_assigned: "Take this conversation to reply.",
  window_closed: "More than 24 hours have passed since the customer's last message, so WhatsApp doesn't allow a free-form reply. Wait for them to write again.",
};
