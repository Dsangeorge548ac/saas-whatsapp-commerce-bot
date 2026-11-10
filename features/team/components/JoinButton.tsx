"use client";
/**
 * Botón "Join": acepta la invitación con la sesión actual. La base de datos comprueba que el correo de la
 * sesión sea el invitado, que el comercio tenga plan vigente y que quede cupo. Si todo va bien, la Server
 * Action redirige al panel.
 */
import { useState, useTransition } from "react";
import { FormAlert, SubmitButton } from "@/components/forms/form-feedback";
import { acceptInvitation } from "@/features/team/actions";

export function JoinButton({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <SubmitButton
        type="button"
        pending={isPending}
        className="sm:w-auto sm:px-8"
        onClick={() =>
          startTransition(async () => {
            const result = await acceptInvitation(token);
            if (result && !result.ok) setError(result.error);
          })
        }
      >
        Join the team
      </SubmitButton>
    </div>
  );
}
