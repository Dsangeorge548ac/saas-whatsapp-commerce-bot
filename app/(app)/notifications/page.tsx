/**
 * /notifications — Avisos del usuario (pedido nuevo, comprobante por revisar, cliente que pidió un asesor,
 * problema con WhatsApp). Filtro y página en la URL (validados con Zod); se actualiza sola con Realtime.
 * Los avisos son personales: no exigen suscripción vigente.
 */
import { Suspense } from "react";
import type { Metadata } from "next";
import { NotificationList } from "@/features/notifications/components/NotificationList";
import { listNotifications } from "@/features/notifications/queries";
import { listParamsSchema } from "@/features/notifications/schemas";
import { RealtimeRefresh } from "@/features/orders/components/RealtimeRefresh";
import { currentMembership, requireWorkspace } from "@/lib/data/workspace";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-canvas" aria-busy="true" />}>
      <NotificationsContent searchParams={searchParams} />
    </Suspense>
  );
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

async function NotificationsContent({ searchParams }: Pick<PageProps<"/notifications">, "searchParams">) {
  const query = await searchParams;
  const workspace = await requireWorkspace();
  const membership = currentMembership(workspace);
  const params = listParamsSchema.parse({ page: first(query.page), filter: first(query.filter) });
  const data = await listNotifications(params);

  return (
    <div className="flex flex-col gap-6">
      {membership ? <RealtimeRefresh tenantId={membership.tenant_id} tables={["notifications"]} channelName="notifications" /> : null}
      <header>
        <h1 className="text-2xl font-medium tracking-tight text-fg">Notifications</h1>
        <p className="mt-1 text-sm text-fg-muted">New orders, payment proofs to review and customers asking for an agent.</p>
      </header>
      <NotificationList {...data} params={params} now={new Date()} />
    </div>
  );
}
