"use client";
/**
 * Acciones sobre el equipo: quitar a un operador y revocar una invitación pendiente (con confirmación).
 * Solo el dueño las ve; las funciones de la base vuelven a comprobarlo (y nunca quitan a un dueño).
 */
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/feedback/sweet-confirm";
import { notify } from "@/components/feedback/notify";
import { removeOperator, revokeInvitation } from "@/features/team/actions";

export function RemoveOperatorButton({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  async function remove() {
    const answer = await confirmAction({ title: `Remove ${name}?`, text: "They lose access to orders and chats right away.", confirmLabel: "Remove from team", tone: "danger" });
    if (!answer.confirmed) return;
    startTransition(async () => {
      const result = await removeOperator(userId);
      if (!result.ok) return notify.error(result.error);
      notify.success("Removed from the team");
      router.refresh();
    });
  }
  return <Button variant="danger-ghost" size="sm" onClick={remove} disabled={isPending}>Remove</Button>;
}

export function RevokeInvitationButton({ id, email }: { id: string; email: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  async function revoke() {
    const answer = await confirmAction({ title: `Cancel the invitation for ${email}?`, text: "The link stops working.", confirmLabel: "Cancel invitation", tone: "danger" });
    if (!answer.confirmed) return;
    startTransition(async () => {
      const result = await revokeInvitation(id);
      if (!result.ok) return notify.error(result.error);
      notify.success("Invitation canceled");
      router.refresh();
    });
  }
  return <Button variant="danger-ghost" size="sm" onClick={revoke} disabled={isPending}>Cancel</Button>;
}
