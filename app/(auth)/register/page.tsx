/**
 * /register — Paso 1: crear la cuenta.
 *   - Sin parámetros: el dueño crea su cuenta y su comercio.
 *   - Con ?invite=<token>: un operador invitado crea su cuenta para unirse al comercio que lo invitó (no se
 *     piden datos del comercio). El correo es el de la invitación (fijo, no editable) y la base valida el token.
 * Lee la URL, por eso el formulario va dentro de <Suspense> (Next 16 con Cache Components).
 */
import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthHeading, AuthTopBar } from "@/components/auth/auth-header";
import { RegisterForm } from "@/features/auth/components/RegisterForm";
import { inviteTokenSchema } from "@/features/auth/schemas";
import { getInvitationPreview } from "@/lib/auth/invitation";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage({ searchParams }: PageProps<"/register">) {
  return (
    <>
      <AuthTopBar prompt="Already have an account?" linkLabel="Log in" href="/login" />
      <Suspense fallback={<div className="mx-auto h-96 w-full max-w-md" aria-hidden />}>
        <RegisterContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function RegisterContent({ searchParams }: Pick<PageProps<"/register">, "searchParams">) {
  const query = await searchParams;
  const raw = Array.isArray(query.invite) ? query.invite[0] : query.invite;
  const invite = inviteTokenSchema.safeParse(raw);
  const inviteToken = invite.success ? invite.data : null;
  // El correo de la cuenta sale de la invitación (no se escribe): así el código le llega al invitado.
  const preview = inviteToken ? await getInvitationPreview(inviteToken) : null;

  if (raw !== undefined && !preview) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 py-10">
        <AuthHeading step="Team invitation" title="This invitation isn't valid" description="It may have expired, been used already or been canceled. Ask the business owner to send you a new invitation link." />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 py-10">
      <AuthHeading
        step="01 / Create account"
        title={preview ? `Join ${preview.businessName}` : "Start selling on WhatsApp"}
        description={
          inviteToken
            ? "Create your account to join the team. We'll send a 6-digit code to the invited email; you join as soon as you verify it."
            : "Create your business account. Set everything up for free; you only subscribe when you're ready to take orders and invite your team."
        }
      />
      <RegisterForm inviteToken={preview ? inviteToken : null} invitedEmail={preview?.email ?? null} />
    </div>
  );
}
