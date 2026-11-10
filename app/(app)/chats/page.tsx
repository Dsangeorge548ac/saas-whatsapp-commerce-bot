/**
 * /chats — Conversaciones de clientes que pidieron un asesor humano.
 *
 * Requiere suscripción vigente: sin ella se muestra la compuerta (y la base de datos tampoco entrega las
 * conversaciones a un operador sin suscripción). La lista y la conversación abierta (?chat=<id>) se actualizan
 * solas con Realtime. Mientras una conversación está con un asesor, el bot NO responde. Dos columnas en
 * pantallas grandes; en móvil se ve la lista o la conversación.
 */
import { Suspense } from "react";
import type { Metadata } from "next";
import { SubscriptionGate } from "@/components/layout/subscription-gate";
import { ChatList } from "@/features/chats/components/ChatList";
import { ChatThread } from "@/features/chats/components/ChatThread";
import { getThread, listChats } from "@/features/chats/queries";
import { beforeSchema, sessionIdSchema } from "@/features/chats/schemas";
import { RealtimeRefresh } from "@/features/orders/components/RealtimeRefresh";
import { currentMembership, requireWorkspace } from "@/lib/data/workspace";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Chats" };

export default function ChatsPage({ searchParams }: PageProps<"/chats">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-canvas" aria-busy="true" />}>
      <ChatsContent searchParams={searchParams} />
    </Suspense>
  );
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

async function ChatsContent({ searchParams }: Pick<PageProps<"/chats">, "searchParams">) {
  const query = await searchParams;
  const workspace = await requireWorkspace();
  const membership = currentMembership(workspace);
  if (!membership?.billable) return <SubscriptionGate isOwner={membership?.role === "owner"} feature="Chats" />;

  const chatId = sessionIdSchema.safeParse(first(query.chat));
  const before = beforeSchema.parse(first(query.before));
  const [lists, thread] = await Promise.all([
    listChats(membership.tenant_id, workspace.user.id),
    chatId.success ? getThread(membership.tenant_id, chatId.data, before) : Promise.resolve(null),
  ]);
  const now = new Date();
  const open = Boolean(thread);

  return (
    <div className="flex flex-col gap-6">
      <RealtimeRefresh tenantId={membership.tenant_id} tables={["conversation_sessions", "messages"]} channelName="chats" />
      <header>
        <h1 className="text-2xl font-medium tracking-tight text-fg">Chats</h1>
        <p className="mt-1 text-sm text-fg-muted">Customers who asked for an agent. While you handle a conversation the bot stays silent. Give it back to the bot when you&apos;re done.</p>
      </header>
      <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <div className={cn(open && "hidden lg:block")}>
          <ChatList waiting={lists.waiting} mine={lists.mine} others={lists.others} selectedId={thread?.session.id ?? null} now={now} />
        </div>
        <div className={cn(!open && "hidden lg:block")}>
          {thread ? (
            <ChatThread thread={thread} userId={workspace.user.id} isOwner={membership.role === "owner"} now={now} />
          ) : (
            <div className="grid min-h-64 place-items-center rounded-lg border border-dashed border-border px-6 py-16 text-center text-sm text-fg-muted">
              Choose a conversation to read it and reply.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
