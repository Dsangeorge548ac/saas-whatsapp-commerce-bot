/**
 * Validaciones (Zod) del módulo de chats: id de conversación, texto del asesor y cursor del historial.
 * Se usan en las Server Actions (la validación que protege) y en el redactor (límite al escribir).
 */
import { z } from "zod";

export const sessionIdSchema = z.uuid();

/** Mensaje de un asesor: texto plano de 1 a 1000 caracteres (WhatsApp admite hasta 4096). */
export const agentMessageSchema = z.string().trim().min(1, "Write a message.").max(1000, "Use 1000 characters or fewer.");

/** Cursor para cargar mensajes anteriores: una fecha ISO válida (si no, se ignora). */
export const beforeSchema = z.iso.datetime({ offset: true }).optional().catch(undefined);

export type ChatActionResult = { ok: true; warning?: string } | { ok: false; error: string };
export const NOT_FOUND: ChatActionResult = { ok: false, error: "Not found." };
