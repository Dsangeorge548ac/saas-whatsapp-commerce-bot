"use client";
/**
 * Redactor del asesor y botones de la conversación.
 *   - Sin tomar: botón "Take conversation" (atómico en la base; si otro la tomó antes, se avisa).
 *   - Tomada por mí y dentro de las 24 h de WhatsApp: caja de texto (Ctrl/Cmd + Enter envía) y "Give back to bot".
 *   - En cualquier otro caso se explica por qué no se puede escribir.
 * El servidor vuelve a aplicar las mismas reglas antes de enviar; esto solo decide qué se ve.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, Hand, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/feedback/sweet-confirm";
import { notify } from "@/components/feedback/notify";
import { claimChat, releaseChat, sendAgentMessage } from "@/features/chats/actions";
import { REPLY_BLOCK_TEXT, type ReplyBlock } from "@/features/chats/rules";

type Props = { sessionId: string; block: ReplyBlock | null; canRelease: boolean };

export function ChatComposer({ sessionId, block, canRelease }: Props) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function send() {
    const message = text.trim();
    if (!message) return;
    setError(null);
    startTransition(async () => {
      const result = await sendAgentMessage(sessionId, message);
      if (!result.ok) return setError(result.error);
      setText("");
      router.refresh();
    });
  }

  function take() {
    startTransition(async () => {
      const result = await claimChat(sessionId);
      if (!result.ok) notify.error(result.error);
      router.refresh();
    });
  }

  async function giveBack() {
    const answer = await confirmAction({ title: "Give this conversation back to the bot?", text: "The bot takes over again and shows the customer the main menu.", confirmLabel: "Give back to bot" });
    if (!answer.confirmed) return;
    startTransition(async () => {
      const result = await releaseChat(sessionId);
      if (!result.ok) return notify.error(result.error);
      if (result.warning) notify.warning("Back with the bot", result.warning);
      else notify.success("Back with the bot");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {block === "not_assigned" ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-fg-muted">{REPLY_BLOCK_TEXT.not_assigned}</p>
          <Button onClick={take} disabled={isPending}>{isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Hand aria-hidden />} Take conversation</Button>
        </div>
      ) : block ? (
        <p className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-fg-muted">{REPLY_BLOCK_TEXT[block]}</p>
      ) : (
        <>
          <label htmlFor="agent-message" className="sr-only">Message to the customer</label>
          <textarea
            id="agent-message"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) send();
            }}
            rows={3}
            maxLength={1000}
            placeholder="Write your reply…"
            className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-black"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-fg-muted">{text.length} / 1000 · Ctrl + Enter to send</span>
            <Button onClick={send} disabled={isPending || text.trim() === ""}>{isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />} Send</Button>
          </div>
        </>
      )}
      {error ? <p role="alert" className="text-xs text-danger-strong">{error}</p> : null}
      {canRelease ? (
        <div>
          <Button variant="ghost" size="sm" onClick={giveBack} disabled={isPending}><Bot aria-hidden /> Give back to bot</Button>
        </div>
      ) : null}
    </div>
  );
}
