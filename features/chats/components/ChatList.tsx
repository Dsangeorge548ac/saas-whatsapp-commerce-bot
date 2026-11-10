/**
 * Lista de conversaciones con asesor: "Waiting" (nadie las tomó), "Yours" y "Other team members".
 * Cada fila es un enlace (?chat=<id>) que abre la conversación. El estado va siempre con texto.
 */
import Link from "next/link";
import { Image as ImageIcon, MapPin, MessageCircle } from "lucide-react";
import { StatusBadge } from "@/components/layout/status-badge";
import { timeAgo } from "@/lib/time-ago";
import { cn } from "@/lib/utils";
import type { Chat } from "@/features/chats/queries";

function preview(chat: Chat): string {
  const last = chat.lastMessage;
  if (!last) return "No messages yet";
  const prefix = last.direction === "outbound" ? "You: " : "";
  if (last.type === "location") return `${prefix}📍 Shared a location`;
  if (last.type === "image" || last.type === "document") return `${prefix}📎 Sent a file`;
  return `${prefix}${last.body ?? "…"}`;
}

function Row({ chat, selected, now }: { chat: Chat; selected: boolean; now: Date }) {
  const activity = chat.lastMessage?.createdAt ?? chat.handoffAt;
  return (
    <li>
      <Link
        href={`/chats?chat=${chat.sessionId}`}
        aria-current={selected ? "true" : undefined}
        className={cn("block rounded-lg border bg-surface p-3.5 transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:outline-black", selected ? "border-black" : "border-border")}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0 truncate text-sm font-semibold text-fg">{chat.name || chat.phone}</span>
          {activity ? <span className="shrink-0 text-[11px] text-fg-muted">{timeAgo(activity, now)}</span> : null}
        </div>
        {chat.name ? <p className="truncate text-xs text-fg-muted">{chat.phone}</p> : null}
        <p className="mt-1.5 flex items-center gap-1.5 truncate text-xs text-fg-muted">
          {chat.lastMessage?.type === "location" ? <MapPin className="size-3.5 shrink-0" aria-hidden /> : chat.lastMessage?.type === "image" ? <ImageIcon className="size-3.5 shrink-0" aria-hidden /> : null}
          <span className="truncate">{preview(chat)}</span>
        </p>
        {chat.assignedName && !selected ? <p className="mt-1.5 text-[11px] text-fg-muted">With {chat.assignedName}</p> : null}
      </Link>
    </li>
  );
}

function Group({ title, chats, selectedId, now, badge }: { title: string; chats: Chat[]; selectedId: string | null; now: Date; badge?: React.ReactNode }) {
  if (chats.length === 0) return null;
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-fg-muted">
        {title} <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] normal-case tracking-normal">{chats.length}</span>
        {badge}
      </h2>
      <ul className="flex flex-col gap-2">
        {chats.map((chat) => (
          <Row key={chat.sessionId} chat={chat} selected={selectedId === chat.sessionId} now={now} />
        ))}
      </ul>
    </section>
  );
}

export function ChatList({ waiting, mine, others, selectedId, now }: { waiting: Chat[]; mine: Chat[]; others: Chat[]; selectedId: string | null; now: Date }) {
  if (waiting.length + mine.length + others.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-6 py-14 text-center">
        <span className="mx-auto grid size-10 place-items-center rounded-lg bg-canvas text-fg"><MessageCircle className="size-5" aria-hidden /></span>
        <p className="mt-3 text-sm font-medium text-fg">No conversations need an agent</p>
        <p className="mx-auto mt-1 max-w-xs text-sm text-fg-muted">When a customer asks for an agent, their chat shows up here and your team is notified.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <Group title="Waiting" chats={waiting} selectedId={selectedId} now={now} badge={waiting.length > 0 ? <StatusBadge tone="warning">Needs an agent</StatusBadge> : null} />
      <Group title="Yours" chats={mine} selectedId={selectedId} now={now} />
      <Group title="Other team members" chats={others} selectedId={selectedId} now={now} />
    </div>
  );
}
