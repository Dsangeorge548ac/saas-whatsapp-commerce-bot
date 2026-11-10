"use client";
/**
 * Editor de los mensajes del bot, agrupados por etapa del flujo (bienvenida, menú, carrito, dirección, pago,
 * pedido y asesor). Cada mensaje trae un texto sugerido que se puede usar tal cual o personalizar.
 *
 * Ayudas: botones para insertar {placeholders} (solo los permitidos), vista previa tipo burbuja de WhatsApp
 * con datos de ejemplo, contador de caracteres, aviso "Needs your info" si quedan [marcas] por completar, y
 * "Reset to default". Se valida aquí (reglas de lib) y otra vez en el servidor y en la base de datos.
 */
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/layout/status-badge";
import { notify } from "@/components/feedback/notify";
import { renderTemplate } from "@/lib/whatsapp/format";
import { markMessagesReviewed, resetMessage, saveMessage } from "@/features/settings/actions/messages";
import { needsInfo, sampleVars, validateMessage } from "@/features/settings/messages";

export type MessageItem = {
  key: string;
  stage: string;
  description: string;
  defaultBody: string;
  body: string;
  isCustom: boolean;
  allowed: string[];
  required: string[];
};

const STAGES: [id: string, title: string][] = [
  ["welcome", "Welcome"],
  ["menu", "Menu and information"],
  ["cart", "Order summary"],
  ["address", "Delivery and location"],
  ["payment", "Payment"],
  ["order", "Order status"],
  ["agent", "Agent and closing hours"],
];

function MessageCard({ item, businessName }: { item: MessageItem; businessName: string }) {
  const router = useRouter();
  const [text, setText] = useState(item.body);
  const [isPending, startTransition] = useTransition();
  const area = useRef<HTMLTextAreaElement>(null);
  const problem = validateMessage(text, item.allowed, item.required);
  const dirty = text !== item.body;

  function insert(name: string) {
    const element = area.current;
    const start = element?.selectionStart ?? text.length;
    const end = element?.selectionEnd ?? text.length;
    setText(`${text.slice(0, start)}{${name}}${text.slice(end)}`);
  }

  function run(task: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) {
    startTransition(async () => {
      const result = await task();
      if (!result.ok) return notify.error(result.error ?? "Something went wrong.");
      notify.success(result.message ?? "Saved");
      after?.();
      router.refresh();
    });
  }

  return (
    <li className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-fg">{item.description}</h3>
        {item.isCustom ? <StatusBadge tone="accent">Customized</StatusBadge> : <StatusBadge tone="neutral">Suggested</StatusBadge>}
        {needsInfo(text) ? <StatusBadge tone="warning">Needs your info</StatusBadge> : null}
      </div>

      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label className="sr-only" htmlFor={`msg-${item.key}`}>{item.description}</label>
          <Textarea id={`msg-${item.key}`} ref={area} value={text} onChange={(event) => setText(event.target.value)} rows={5} maxLength={1000} aria-invalid={Boolean(problem)} />
          <div className="flex items-center justify-between text-xs text-fg-muted">
            <span>{text.length} / 1000</span>
            {item.allowed.length > 0 ? <span>Click to insert:</span> : <span>No placeholders</span>}
          </div>
          {item.allowed.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {item.allowed.map((name) => (
                <button key={name} type="button" onClick={() => insert(name)} className="rounded-lg border border-border px-2 py-1 font-mono text-[11px] text-fg hover:bg-muted">
                  {`{${name}}`}{item.required.includes(name) ? " *" : ""}
                </button>
              ))}
            </div>
          ) : null}
          {problem ? <p role="alert" className="text-xs text-danger-strong">{problem}</p> : null}
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-fg-muted">Preview</p>
          <div className="rounded-lg bg-[#e7f3dd] p-3">
            <p className="whitespace-pre-wrap rounded-lg bg-white px-3 py-2 text-sm text-fg shadow-sm">
              {renderTemplate(text, sampleVars(businessName)) || "—"}
            </p>
          </div>
          <p className="mt-1 text-[11px] text-fg-muted">Sample data. * = required.</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={isPending || Boolean(problem) || !dirty} onClick={() => run(() => saveMessage(item.key, text))}>Save</Button>
        {item.isCustom || dirty ? (
          <Button size="sm" variant="ghost" disabled={isPending} onClick={() => (item.isCustom ? run(() => resetMessage(item.key), () => setText(item.defaultBody)) : setText(item.defaultBody))}>
            <RotateCcw aria-hidden /> Use suggested text
          </Button>
        ) : null}
      </div>
    </li>
  );
}

export function MessagesEditor({ items, businessName, reviewed }: { items: MessageItem[]; businessName: string; reviewed: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex max-w-5xl flex-col gap-8">
      {STAGES.map(([stage, title]) => {
        const group = items.filter((item) => item.stage === stage);
        if (group.length === 0) return null;
        return (
          <section key={stage} aria-labelledby={`stage-${stage}`} className="flex flex-col gap-3">
            <h2 id={`stage-${stage}`} className="text-base font-semibold text-fg">{title}</h2>
            <ul className="flex flex-col gap-3">
              {group.map((item) => (
                <MessageCard key={item.key} item={item} businessName={businessName} />
              ))}
            </ul>
          </section>
        );
      })}
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
        <Button
          disabled={isPending || reviewed}
          onClick={() =>
            startTransition(async () => {
              const result = await markMessagesReviewed();
              if (!result.ok) return notify.error(result.error);
              notify.success("Marked as reviewed");
              router.refresh();
            })
          }
        >
          {reviewed ? "Messages reviewed" : "I reviewed my messages"}
        </Button>
        <p className="text-xs text-fg-muted">Completes this step of the setup guide. You can keep editing any time.</p>
      </div>
    </div>
  );
}
