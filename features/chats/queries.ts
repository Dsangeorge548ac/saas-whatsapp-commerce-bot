/**
 * Consultas del módulo de chats (con la sesión del usuario: RLS limita todo al comercio y exige suscripción
 * vigente a los operadores). Todo acotado: la lista trae máx. 50 conversaciones y el último mensaje de cada
 * una en UNA consulta; el hilo trae 50 mensajes por página (cursor por fecha).
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";

export const THREAD_PAGE = 50;

export type Chat = {
  sessionId: string;
  name: string | null;
  phone: string;
  assignedTo: string | null;
  assignedName: string | null;
  handoffAt: string | null;
  lastInboundAt: string | null;
  windowExpiresAt: string | null;
  lastMessage: { body: string | null; direction: "inbound" | "outbound"; createdAt: string; type: string } | null;
};

/** Conversaciones con un asesor humano: sin tomar (waiting), mías y de otros compañeros. */
export async function listChats(tenantId: string, userId: string) {
  const supabase = await createClient();
  const { data: sessions } = await supabase
    .from("conversation_sessions")
    .select("id, customer_id, assigned_to, handoff_requested_at, last_inbound_at, window_expires_at")
    .eq("tenant_id", tenantId)
    .eq("mode", "human")
    .is("closed_at", null)
    .order("handoff_requested_at", { ascending: true })
    .limit(50);
  const rows = sessions ?? [];
  if (rows.length === 0) return { waiting: [], mine: [], others: [] } satisfies Record<string, Chat[]>;

  const customerIds = rows.map((row) => row.customer_id);
  const assigneeIds = [...new Set(rows.map((row) => row.assigned_to).filter((id): id is string => Boolean(id)))];
  const [customers, messages, assignees] = await Promise.all([
    supabase.from("customers").select("id, phone_e164, profile_name").in("id", customerIds),
    supabase
      .from("messages")
      .select("customer_id, body, direction, message_type, created_at")
      .eq("tenant_id", tenantId)
      .in("customer_id", customerIds)
      .order("created_at", { ascending: false })
      .limit(Math.min(400, customerIds.length * 8)),
    assigneeIds.length ? supabase.from("profiles").select("id, first_name, last_name").in("id", assigneeIds) : Promise.resolve({ data: [] }),
  ]);

  const customerById = new Map((customers.data ?? []).map((customer) => [customer.id, customer]));
  const lastByCustomer = new Map<string, NonNullable<Chat["lastMessage"]>>();
  for (const message of messages.data ?? []) {
    if (!lastByCustomer.has(message.customer_id)) {
      lastByCustomer.set(message.customer_id, { body: message.body, direction: message.direction, createdAt: message.created_at, type: message.message_type });
    }
  }
  const nameById = new Map((assignees.data ?? []).map((profile) => [profile.id, `${profile.first_name} ${profile.last_name}`.trim() || "Team member"]));

  const chats: Chat[] = rows.map((row) => {
    const customer = customerById.get(row.customer_id);
    return {
      sessionId: row.id,
      name: customer?.profile_name ?? null,
      phone: customer?.phone_e164 ?? "",
      assignedTo: row.assigned_to,
      assignedName: row.assigned_to ? (nameById.get(row.assigned_to) ?? "Team member") : null,
      handoffAt: row.handoff_requested_at,
      lastInboundAt: row.last_inbound_at,
      windowExpiresAt: row.window_expires_at,
      lastMessage: lastByCustomer.get(row.customer_id) ?? null,
    };
  });
  return {
    waiting: chats.filter((chat) => !chat.assignedTo),
    mine: chats.filter((chat) => chat.assignedTo === userId),
    others: chats.filter((chat) => chat.assignedTo && chat.assignedTo !== userId),
  };
}

export type ThreadMessage = {
  id: string;
  direction: "inbound" | "outbound";
  senderType: "customer" | "bot" | "operator" | "system";
  senderName: string | null;
  type: string;
  body: string | null;
  status: string | null;
  createdAt: string;
};

/** Un hilo: la conversación, el cliente y sus mensajes (los más recientes, o los anteriores a `before`). */
export async function getThread(tenantId: string, sessionId: string, before?: string) {
  const supabase = await createClient();
  const { data: session } = await supabase
    .from("conversation_sessions")
    .select("id, customer_id, mode, assigned_to, window_expires_at, closed_at")
    .eq("id", sessionId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!session) return null;

  let query = supabase
    .from("messages")
    .select("id, direction, sender_type, sender_user_id, message_type, body, delivery_status, created_at")
    .eq("tenant_id", tenantId)
    .eq("customer_id", session.customer_id);
  if (before) query = query.lt("created_at", before);
  const [{ data: page }, { data: customer }] = await Promise.all([
    query.order("created_at", { ascending: false }).limit(THREAD_PAGE + 1),
    supabase.from("customers").select("phone_e164, profile_name").eq("id", session.customer_id).maybeSingle(),
  ]);

  const rows = page ?? [];
  const hasMore = rows.length > THREAD_PAGE;
  const ordered = rows.slice(0, THREAD_PAGE).reverse();
  const senderIds = [...new Set(ordered.map((row) => row.sender_user_id).filter((id): id is string => Boolean(id)))];
  const { data: senders } = senderIds.length ? await supabase.from("profiles").select("id, first_name, last_name").in("id", senderIds) : { data: [] };
  const names = new Map((senders ?? []).map((profile) => [profile.id, `${profile.first_name} ${profile.last_name}`.trim() || "Team member"]));

  const messages: ThreadMessage[] = ordered.map((row) => ({
    id: row.id,
    direction: row.direction,
    senderType: row.sender_type,
    senderName: row.sender_user_id ? (names.get(row.sender_user_id) ?? "Team member") : null,
    type: row.message_type,
    body: row.body,
    status: row.delivery_status,
    createdAt: row.created_at,
  }));

  return {
    session: { id: session.id, mode: session.mode, assignedTo: session.assigned_to, windowExpiresAt: session.window_expires_at, closed: Boolean(session.closed_at) },
    customer: { name: customer?.profile_name ?? null, phone: customer?.phone_e164 ?? "" },
    messages,
    oldest: ordered[0]?.created_at ?? null,
    hasMore,
  };
}
