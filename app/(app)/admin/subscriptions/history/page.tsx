/**
 * /admin/subscriptions/history — ya no es una vista aparte: el módulo /admin/subscriptions muestra todos los
 * registros (una fila por suscripción). Se conserva para que los enlaces viejos sigan funcionando.
 */
import { redirect } from "next/navigation";

export default function SubscriptionHistoryRedirect() {
  redirect("/admin/subscriptions");
}
