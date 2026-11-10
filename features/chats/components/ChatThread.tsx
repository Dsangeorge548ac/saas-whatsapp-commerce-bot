/**
 * Conversación con un cliente: cabecera, mensajes (cliente a la izquierda; bot y equipo a la derecha, cada
 * uno con su etiqueta) y el redactor. Se identifica quién escribió cada mensaje (cliente, bot o miembro del
 * equipo) para poder auditar humano vs. automático. Las ubicaciones y archivos del cliente no se muestran
 * aquí (solo un aviso): la ubicación va en el pedido y los comprobantes se revisan en Orders.
 */
import Link from "next/link";
import { ArrowLeft, Check, CheckCheck, CircleAlert, Clock } from "lucide-react";
import { StatusBadge } from "@/components/layout/status-badge";
import { ChatComposer } from "@/features/chats/components/ChatComposer";
import { ThreadScroller } from "@/features/chats/components/ThreadScroller";
import type { getThread } from "@/features/chats/queries";
import { canReply } from "@/features/chats/rules";
import { cn } from "@/lib/utils";

type Thread = NonNullable<Awaited<ReturnType<typeof getThread>>>;
const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const day = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

function messageText(type: string, body: string | null): string {
  if (type === "location") return "📍 Shared a location (it goes on the order).";
  if (type === "image") return `📎 Sent an image${body ? `: ${body}` : ""}`;
  if (type === "document") return `📎 Sent a document${body ? `: ${body}` : ""}`;
  return body?.trim() || "—";
}

function Ticks({ status }: { status: string | null }) {
  if (status === "failed") return <span className="inline-flex items-center gap-1 text-danger-strong"><CircleAlert className="size-3" aria-hidden /> Not delivered</span>;
  if (status === "read") return <CheckCheck className="size-3" aria-label="Read" />;
  if (status === "delivered") return <CheckCheck className="size-3 text-fg-muted" aria-label="Delivered" />;
  if (status === "sent") return <Check className="size-3 text-fg-muted" aria-label="Sent" />;
  return <Clock className="size-3 text-fg-muted" aria-label="Sending" />;
}

export function ChatThread({ thread, userId, isOwner, now }: { thread: Thread; userId: string; isOwner: boolean; now: Date }) {
  const { session, customer, messages } = thread;
  const check = canReply({ mode: session.mode, assignedTo: session.assignedTo, windowExpiresAt: session.windowExpiresAt }, userId, now);
  const windowOpen = Boolean(session.windowExpiresAt && new Date(session.windowExpiresAt) > now);
  const canRelease = session.mode === "human" && (session.assignedTo === userId || isOwner);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <header className="flex flex-wrap items-center gap-3">
        <Link href="/chats" className="grid size-9 place-items-center rounded-lg hover:bg-muted lg:hidden" aria-label="Back to conversations"><ArrowLeft className="size-5" aria-hidden /></Link>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-fg">{customer.name || customer.phone}</h2>
          {customer.name ? <p className="truncate text-xs text-fg-muted">{customer.phone}</p> : null}
        </div>
        <StatusBadge tone={session.mode === "bot" ? "neutral" : session.assignedTo ? "accent" : "warning"}>
          {session.mode === "bot" ? "With the bot" : session.assignedTo ? (session.assignedTo === userId ? "You're handling it" : "Taken") : "Needs an agent"}
        </StatusBadge>
        {session.mode === "human" ? <span className={cn("text-xs", windowOpen ? "text-fg-muted" : "text-danger-strong")}>{windowOpen ? "24h window open" : "24h window closed"}</span> : null}
      </header>

      <ThreadScroller anchor={messages[messages.length - 1]?.id ?? "empty"}>
        {thread.hasMore && thread.oldest ? (
          <div className="mb-3 text-center">
            <Link href={`/chats?chat=${session.id}&before=${encodeURIComponent(thread.oldest)}`} className="text-xs font-medium underline underline-offset-2">Load earlier messages</Link>
          </div>
        ) : null}
        {messages.length === 0 ? <p className="py-10 text-center text-sm text-fg-muted">No messages yet.</p> : null}
        <ol className="flex flex-col gap-2">
          {messages.map((message, index) => {
            const created = new Date(message.createdAt);
            const dayLabel = day.format(created);
            const previous = messages[index - 1];
            const showDay = !previous || day.format(new Date(previous.createdAt)) !== dayLabel;
            const mine = message.direction === "outbound";
            const operator = message.senderType === "operator";
            return (
              <li key={message.id}>
                {showDay ? <p className="my-2 text-center text-[11px] font-medium text-fg-muted">{dayLabel}</p> : null}
                <div className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
                  <p className="mb-0.5 px-1 text-[11px] text-fg-muted">
                    {mine ? (operator ? (message.senderName ?? "Team") : message.senderType === "bot" ? "Bot" : "System") : (customer.name || "Customer")}
                  </p>
                  <div className={cn("max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm", mine ? (operator ? "bg-black text-white" : "border border-border bg-surface text-fg") : "bg-surface text-fg shadow-sm")}>
                    {messageText(message.type, message.body)}
                  </div>
                  <p className="mt-0.5 flex items-center gap-1.5 px-1 text-[11px] text-fg-muted">
                    {time.format(created)}
                    {mine ? <Ticks status={message.status} /> : null}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </ThreadScroller>

      {session.closed ? (
        <p className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-fg-muted">This conversation is closed. It reopens when the customer writes again.</p>
      ) : (
        <ChatComposer sessionId={session.id} block={check.ok ? null : check.reason} canRelease={canRelease} />
      )}
    </div>
  );
}
