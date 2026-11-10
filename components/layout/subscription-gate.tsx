/**
 * Compuerta de suscripción: se muestra EN LUGAR del contenido de Orders y Chats cuando el comercio
 * no tiene la suscripción vigente (mismo patrón que el VerificationGate de Tax Pro).
 *   - Dueño: botón negro a Billing.
 *   - Operador: no puede pagar; se le pide hablar con el dueño.
 * Es solo la parte visual: la base de datos (RLS y funciones) y las Server Actions vuelven a
 * comprobar la suscripción, así que saltarse esta pantalla no da acceso a nada.
 */
import Link from "next/link";
import { Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export function SubscriptionGate({ isOwner, feature }: { isOwner: boolean; feature: string }) {
  const unlocks = ["Take orders and review payment proofs", "Chat with customers who ask for an agent", "Invite your team"];

  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-canvas text-fg">
        <Lock className="size-6" aria-hidden />
      </span>
      <h1 className="mt-6 text-2xl font-medium tracking-tight text-fg">{feature} is locked</h1>
      <p className="mt-2 text-sm text-fg-muted">
        {isOwner
          ? "You can set up everything for free. Subscribe to unlock your orders, chats and team."
          : "This section opens again when the business owner renews the plan. Ask them to check Billing."}
      </p>
      {/* La lista de lo que desbloquea el plan solo le sirve al dueño (el operador no puede contratarlo). */}
      {isOwner ? (
        <ul className="mt-6 w-full space-y-2 rounded-lg border border-border p-4 text-left text-sm">
          {unlocks.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-fg">
              <Check className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
      ) : null}
      {isOwner ? (
        <Link
          href="/settings/billing"
          className={cn("mt-6 inline-flex h-12 items-center justify-center rounded-lg bg-black px-6 text-sm font-medium text-white sm:h-11")}
        >
          Choose a plan
        </Link>
      ) : null}
    </div>
  );
}
