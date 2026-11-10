"use client";
/** Botón "Mark all as read": llama a la Server Action (que revalida sesión) y refresca la lista. */
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { notify } from "@/components/feedback/notify";
import { markAllRead } from "@/features/notifications/actions";

export function MarkAllReadButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => { const r = await markAllRead(); if (!r.ok) notify.error(r.error); else router.refresh(); })}
      className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-fg hover:bg-muted disabled:opacity-60 sm:w-auto"
    >
      Mark all as read
    </button>
  );
}
