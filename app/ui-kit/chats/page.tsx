/**
 * /ui-kit/chats — Vista previa de los chats con asesor con datos de EJEMPLO (solo desarrollo).
 * Permite revisar el diseño sin sesión ni base de datos. En producción responde 404.
 */
import { notFound } from "next/navigation";
import { ChatList } from "@/features/chats/components/ChatList";
import { ChatThread } from "@/features/chats/components/ChatThread";
import type { Chat, ThreadMessage } from "@/features/chats/queries";

const now = new Date("2026-11-10T12:00:00Z");
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();
const ME = "11111111-1111-4111-8111-111111111111";

const chat = (n: number, over: Partial<Chat>): Chat => ({
  sessionId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  name: "Ana Pérez",
  phone: "+584141234567",
  assignedTo: null,
  assignedName: null,
  handoffAt: ago(6),
  lastInboundAt: ago(5),
  windowExpiresAt: new Date(now.getTime() + 20 * 3_600_000).toISOString(),
  lastMessage: { body: "Hola, ¿pueden hacerme una torta personalizada?", direction: "inbound", createdAt: ago(5), type: "text" },
  ...over,
});

const waiting = [
  chat(1, {}),
  chat(2, { name: null, phone: "+584149990000", handoffAt: ago(40), lastMessage: { body: null, direction: "inbound", createdAt: ago(38), type: "location" } }),
];
const mine = [chat(3, { name: "Luis Gómez", assignedTo: ME, assignedName: "You", lastMessage: { body: "Perfecto, te espero entonces", direction: "inbound", createdAt: ago(2), type: "text" } })];
const others = [chat(4, { name: "María Ruiz", assignedTo: "x", assignedName: "Carla Díaz", lastMessage: { body: "Le confirmo en unos minutos", direction: "outbound", createdAt: ago(15), type: "text" } })];

const m = (i: number, over: Partial<ThreadMessage>): ThreadMessage => ({
  id: `m${i}`, direction: "inbound", senderType: "customer", senderName: null, type: "text", body: "", status: null, createdAt: ago(60 - i * 5), event: null, ...over,
});
const messages: ThreadMessage[] = [
  m(1, { direction: "outbound", senderType: "bot", body: "¡Hola Luis! 🥐 Bienvenido a Luna Bakery.", status: "read" }),
  m(2, { body: "Quiero hablar con alguien por favor" }),
  m(3, { direction: "outbound", senderType: "bot", body: "Un asesor te atenderá en breve. Gracias por tu paciencia.", status: "delivered" }),
  m(3.5, { direction: "outbound", senderType: "bot", body: "👋 Ahora te atiende un asesor de Luna Bakery. Cuéntanos en qué te podemos ayudar.", status: "delivered", event: "agent_joined" }),
  m(4, { direction: "outbound", senderType: "operator", senderName: "Carla Díaz", body: "Hola Luis, soy Carla. ¿En qué te ayudo?", status: "read" }),
  m(5, { body: "Necesito una torta para el sábado, ¿hasta qué hora hacen pedidos?" }),
  m(6, { direction: "outbound", senderType: "operator", senderName: "Carla Díaz", body: "Hasta el jueves a las 6 PM. Te paso el catálogo.", status: "failed" }),
  m(7, { type: "location", body: null }),
  m(8, { direction: "outbound", senderType: "bot", body: "Gracias por escribirnos. El asesor terminó esta conversación.", status: "read", event: "agent_left" }),
];

export default function ChatsPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const thread = {
    session: { id: mine[0]!.sessionId, mode: "human" as const, assignedTo: ME, windowExpiresAt: new Date(now.getTime() + 20 * 3_600_000).toISOString(), closed: false },
    customer: { name: "Luis Gómez", phone: "+584141234567" },
    messages,
    oldest: ago(60),
    hasMore: true,
  };
  const untaken = { ...thread, session: { ...thread.session, assignedTo: null } };
  const closedWindow = { ...thread, session: { ...thread.session, windowExpiresAt: ago(30) } };
  return (
    <main className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-10 bg-surface px-4 py-8">
      <div>
        <h1 className="text-2xl font-medium tracking-tight text-fg">Chats — preview with sample data</h1>
        <p className="mt-1 text-sm text-fg-muted">Development only. Nothing here is real.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <ChatList waiting={waiting} mine={mine} others={others} selectedId={mine[0]!.sessionId} now={now} />
        <ChatThread thread={thread} userId={ME} isOwner={false} now={now} />
      </div>
      <section className="grid gap-6 lg:grid-cols-2">
        <div><h2 className="mb-2 text-sm font-semibold">Not taken yet</h2><ChatThread thread={{ ...untaken, messages: messages.slice(0, 3), hasMore: false }} userId={ME} isOwner={false} now={now} /></div>
        <div><h2 className="mb-2 text-sm font-semibold">24h window closed</h2><ChatThread thread={{ ...closedWindow, messages: messages.slice(3, 5), hasMore: false }} userId={ME} isOwner={false} now={now} /></div>
      </section>
    </main>
  );
}
