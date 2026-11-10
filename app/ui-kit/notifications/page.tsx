/**
 * /ui-kit/notifications — Vista previa de la lista de avisos con datos de EJEMPLO (solo desarrollo).
 * En producción responde 404.
 */
import { notFound } from "next/navigation";
import { NotificationList } from "@/features/notifications/components/NotificationList";
import type { NotificationItem } from "@/features/notifications/queries";

const now = new Date("2026-11-10T12:00:00Z");
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();
const item = (n: number, kind: string, title: string, minutes: number, read: boolean, link: string | null): NotificationItem => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, kind, title, link, read, createdAt: ago(minutes),
});

const items = [
  item(1, "order_new", "New order #42", 3, false, "/orders"),
  item(2, "handoff_requested", "A customer asked for an agent", 25, false, "/chats"),
  item(3, "proof_submitted", "Payment proof to review", 180, true, "/orders"),
  item(4, "whatsapp_error", "WhatsApp connection needs attention", 3000, true, "/settings/whatsapp"),
];

export default function NotificationsPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-8 bg-surface px-4 py-8">
      <h1 className="text-2xl font-medium tracking-tight text-fg">Notifications — preview with sample data</h1>
      <NotificationList items={items} total={44} page={1} pageCount={3} params={{ page: 1, filter: "all" }} now={now} />
      <NotificationList items={[]} total={0} page={1} pageCount={1} params={{ page: 1, filter: "unread" }} now={now} />
    </main>
  );
}
