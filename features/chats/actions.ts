"use server";
/**
 * Server Actions de los chats con asesor (dueño u operador con suscripción vigente).
 *
 *   - claimChat: tomar la conversación. Es atómico en la base (claim_session): si dos asesores la piden a la
 *     vez, gana uno y el otro recibe un aviso.
 *   - sendAgentMessage: responder al cliente por WhatsApp. Solo si la conversación está en modo humano, la
 *     tomó ESTE usuario y sigue abierta la ventana de 24 h de WhatsApp (las reglas de features/chats/rules.ts;
 *     la sesión se lee con RLS, así que una conversación de otro comercio simplemente no aparece). El mensaje
 *     queda registrado con quién lo envió, para auditar humano vs. automático.
 *   - releaseChat: devolver la conversación al bot (la base lo permite a quien la atiende o al dueño).
 * Privacidad: el texto de los mensajes NUNCA se guarda en la auditoría ni en logs; solo en `messages`.
 */
import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import { getOperatorContext } from "@/lib/auth/operator";
import { takeAttempt } from "@/lib/auth/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSessionContext } from "@/features/whatsapp/context";
import { showMainMenu } from "@/features/whatsapp/flows/browse";
import { send } from "@/features/whatsapp/outbound";
import { REPLY_BLOCK_TEXT, canReply } from "@/features/chats/rules";
import { NOT_FOUND, agentMessageSchema, sessionIdSchema, type ChatActionResult } from "@/features/chats/schemas";

export async function claimChat(sessionId: unknown): Promise<ChatActionResult> {
  const operator = await getOperatorContext();
  const id = sessionIdSchema.safeParse(sessionId);
  if (!operator || !id.success) return NOT_FOUND;

  const { error } = await operator.supabase.rpc("claim_session", { p_session: id.data });
  if (error) return { ok: false, error: error.message.includes("ALREADY_CLAIMED") ? "Another team member already took this conversation." : "We couldn't take this conversation." };
  revalidatePath("/chats");
  return { ok: true };
}

export async function sendAgentMessage(sessionId: unknown, text: unknown): Promise<ChatActionResult> {
  const operator = await getOperatorContext();
  const id = sessionIdSchema.safeParse(sessionId);
  const body = agentMessageSchema.safeParse(text);
  if (!operator || !id.success) return NOT_FOUND;
  if (!body.success) return { ok: false, error: body.error.issues[0]?.message ?? "Write a message." };

  // Anti abuso: ráfagas de mensajes por usuario.
  const blocked = await takeAttempt(["agentMessage", operator.userId]);
  if (blocked) return { ok: false, error: blocked };

  // La sesión se lee con la sesión del usuario (RLS): una ajena no devuelve nada.
  const { data: session } = await operator.supabase
    .from("conversation_sessions")
    .select("mode, assigned_to, window_expires_at, closed_at")
    .eq("id", id.data)
    .eq("tenant_id", operator.tenantId)
    .maybeSingle();
  if (!session || session.closed_at) return NOT_FOUND;
  const check = canReply({ mode: session.mode, assignedTo: session.assigned_to, windowExpiresAt: session.window_expires_at }, operator.userId);
  if (!check.ok) return { ok: false, error: REPLY_BLOCK_TEXT[check.reason] };

  try {
    const ctx = await loadSessionContext(createAdminClient(), operator.tenantId, id.data);
    if (!ctx) return NOT_FOUND;
    await send(ctx, { kind: "text", body: body.data }, "agent_message", { type: "operator", userId: operator.userId });
  } catch {
    // El envío falló (token vencido, ventana cerrada en Meta…): quedó registrado como fallido en el chat.
    revalidatePath("/chats");
    return { ok: false, error: "WhatsApp didn't accept the message. It's marked as failed in the chat; check the connection in Settings." };
  }
  revalidatePath("/chats");
  return { ok: true };
}

/** Devuelve la conversación al bot y le muestra al cliente el menú principal. */
export async function releaseChat(sessionId: unknown): Promise<ChatActionResult> {
  const operator = await getOperatorContext();
  const id = sessionIdSchema.safeParse(sessionId);
  if (!operator || !id.success) return NOT_FOUND;

  const { error } = await operator.supabase.rpc("release_session", { p_session: id.data });
  if (error) return { ok: false, error: "Only the person handling this conversation (or the owner) can give it back to the bot." };

  // El bot retoma la conversación: se le muestra el menú (si falla —p. ej. ventana de 24 h cerrada— no importa).
  let warning: string | undefined;
  try {
    const ctx = await loadSessionContext(createAdminClient(), operator.tenantId, id.data);
    if (ctx) await showMainMenu(ctx, { greet: false });
  } catch {
    warning = "The bot has the conversation again, but we couldn't send the customer the menu.";
  }
  await logAudit({ actorId: operator.userId, action: "CHAT_RETURNED_TO_BOT", resource: "conversation_sessions", tenantId: operator.tenantId, details: { session_id: id.data } });
  revalidatePath("/chats");
  return { ok: true, warning };
}
