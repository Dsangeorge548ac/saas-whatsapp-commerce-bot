"use client";
/**
 * Panel para encender o pausar el bot. Muestra qué falta (con enlace a cada paso) y solo habilita
 * "Turn on" cuando está todo. La base de datos vuelve a comprobarlo al activar. Pausar es inmediato: el bot
 * deja de tomar pedidos y avisa a los clientes que no está atendiendo.
 */
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/feedback/sweet-confirm";
import { notify } from "@/components/feedback/notify";
import { activateBot, markBotTested, pauseBot } from "@/features/settings/actions/go-live";

export type Requirement = { key: string; label: string; href: string; done: boolean };

export function GoLivePanel({ botEnabled, requirements, tested }: { botEnabled: boolean; requirements: Requirement[]; tested: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const ready = requirements.every((item) => item.done);

  function run(task: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    startTransition(async () => {
      const result = await task();
      if (!result.ok) return notify.error(result.error ?? "Something went wrong.");
      notify.success(result.message ?? "Done");
      router.refresh();
    });
  }

  async function pause() {
    const answer = await confirmAction({ title: "Pause your bot?", text: "Customers who write will be told you aren't taking orders. Orders already in progress are not affected.", confirmLabel: "Pause bot", tone: "danger" });
    if (answer.confirmed) run(() => pauseBot());
  }

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <section aria-labelledby="needs" className="flex flex-col gap-3">
        <h2 id="needs" className="text-base font-semibold text-fg">Before you turn it on</h2>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {requirements.map((item) => (
            <li key={item.key} className="flex items-center gap-3 px-4 py-3">
              <span className={item.done ? "grid size-5 place-items-center rounded-full bg-black text-white" : "size-5 rounded-full border border-chart-muted-strong"} aria-hidden>
                {item.done ? <Check className="size-3" /> : null}
              </span>
              <span className="flex-1 text-sm text-fg">{item.label}</span>
              {item.done ? <span className="text-xs text-fg-muted">Done</span> : <Link href={item.href} className="text-xs font-medium underline underline-offset-2">Do it</Link>}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="test" className="flex flex-col gap-2">
        <h2 id="test" className="text-base font-semibold text-fg">Test it first</h2>
        <p className="text-sm text-fg-muted">Write to your WhatsApp number from your own phone and place a full test order: menu, catalog, delivery, payment proof. Then mark it as tested.</p>
        <div><Button variant="outline" disabled={isPending || tested} onClick={() => run(() => markBotTested())}>{tested ? "Marked as tested" : "I tested my bot"}</Button></div>
      </section>

      <section aria-labelledby="live" className="flex flex-col gap-3 rounded-lg border border-border p-5">
        <h2 id="live" className="text-base font-semibold text-fg">{botEnabled ? "Your bot is live" : "Turn on your bot"}</h2>
        <p className="text-sm text-fg-muted">
          {botEnabled ? "Customers can order on WhatsApp right now." : ready ? "Everything is ready. Customers will be able to order as soon as you turn it on." : "Complete the steps above to unlock this."}
        </p>
        <div>
          {botEnabled ? (
            <Button variant="outline" disabled={isPending} onClick={pause}><PowerOff aria-hidden /> Pause bot</Button>
          ) : (
            <Button disabled={isPending || !ready} onClick={() => run(() => activateBot())}><Power aria-hidden /> Turn on bot</Button>
          )}
        </div>
      </section>
    </div>
  );
}
