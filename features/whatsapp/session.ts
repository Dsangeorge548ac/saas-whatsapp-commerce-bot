/**
 * Estado de la conversación (FSM) en conversation_sessions.
 *
 * Qué hace: lee el contexto efímero del pedido en curso y cambia el estado con control optimista de
 * concurrencia (version). La base valida además que la transición sea legal (session_transition_allowed),
 * así que un salto ilegal falla aunque este código se equivoque.
 * Quién lo usa: los flujos de features/whatsapp/flows/*.
 */
import "server-only";
import type { Json } from "@/types/database";
import { sessionContextSchema, type Ctx, type SessionContext, type SessionState } from "@/features/whatsapp/types";

export function readContext(ctx: Ctx): SessionContext {
  const parsed = sessionContextSchema.safeParse(ctx.session.state_context);
  return parsed.success ? parsed.data : {};
}

/** Cambia el estado y fusiona `patch` en el contexto (`null` vacía el contexto). */
export async function setState(ctx: Ctx, state: SessionState, patch: Partial<SessionContext> | null = {}): Promise<void> {
  const context = patch === null ? {} : { ...readContext(ctx), ...patch };
  const { data, error } = await ctx.admin
    .from("conversation_sessions")
    .update({ state, state_context: context as Json })
    .eq("id", ctx.session.id)
    .eq("version", ctx.session.version)
    .select()
    .single();
  // Otro mensaje del mismo cliente modificó la sesión a la vez: el evento queda fallido y se reintenta.
  if (error || !data) throw new Error("SESSION_CONFLICT");
  ctx.session = data;
}

/** Pasa la conversación a un asesor humano: el bot deja de responder hasta que se la devuelvan. */
export async function requestHandoff(ctx: Ctx): Promise<void> {
  const { data, error } = await ctx.admin
    .from("conversation_sessions")
    .update({ mode: "human", state: "human_handoff", handoff_requested_at: new Date().toISOString() })
    .eq("id", ctx.session.id)
    .eq("version", ctx.session.version)
    .select()
    .single();
  if (error || !data) throw new Error("SESSION_CONFLICT");
  ctx.session = data;
}
