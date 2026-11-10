"use client";
/**
 * Un aviso de la lista: al abrirlo se marca como leído y navega a su enlace (/orders, /chats…); también
 * se puede eliminar. Los enlaces ya llegan filtrados (solo rutas internas).
 */
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bell, CreditCard, MessageCircle, ShoppingBag, Trash2 } from "lucide-react";
import { notify } from "@/components/feedback/notify";
import { deleteNotification, markRead } from "@/features/notifications/actions";
import type { NotificationItem } from "@/features/notifications/queries";
import { timeAgo } from "@/lib/time-ago";
import { cn } from "@/lib/utils";

const ICON = { order_new: ShoppingBag, proof_submitted: CreditCard, handoff_requested: MessageCircle, whatsapp_error: AlertTriangle } as const;

export function NotificationRow({ item, now }: { item: NotificationItem; now: Date }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const Icon = ICON[item.kind as keyof typeof ICON] ?? Bell;

  const open = () =>
    start(async () => {
      if (!item.read) await markRead(item.id);
      if (item.link) router.push(item.link);
      else router.refresh();
    });
  const remove = () =>
    start(async () => {
      const result = await deleteNotification(item.id);
      if (!result.ok) notify.error(result.error);
      else router.refresh();
    });

  return (
    <li className={cn("flex items-center gap-3 px-4 py-3", pending && "opacity-60", !item.read && "bg-canvas")}>
      <button type="button" onClick={open} disabled={pending} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-surface"><Icon className="size-4" aria-hidden /></span>
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-sm", item.read ? "text-fg-muted" : "font-semibold text-fg")}>{item.title}</span>
          <span className="block text-xs text-fg-muted">{timeAgo(item.createdAt, now)}</span>
        </span>
        {!item.read ? <span className="size-2 shrink-0 rounded-full bg-black" aria-label="Unread" /> : null}
      </button>
      <button type="button" onClick={remove} disabled={pending} aria-label="Delete notification" className="grid size-9 shrink-0 place-items-center rounded-lg text-fg-muted hover:bg-muted hover:text-fg"><Trash2 className="size-4" aria-hidden /></button>
    </li>
  );
}
