/**
 * /join?token=… — Enlace de invitación que el dueño le manda a un operador.
 *   - Con sesión de la persona invitada: botón "Join" (la base valida que el correo coincida, el plan y el cupo).
 *   - Con sesión de OTRA cuenta (p. ej. el dueño que invitó, en el mismo navegador): aviso y "Sign out and continue".
 *   - Sin sesión: crear cuenta (con ese correo) o iniciar sesión y volver aquí.
 * El token es un secreto de un solo uso: no se muestra, y la base solo guarda su hash.
 */
import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { connection } from "next/server";
import { AuthHeading, AuthTopBar } from "@/components/auth/auth-header";
import { JoinButton } from "@/features/team/components/JoinButton";
import { signOutToJoin } from "@/features/team/actions";
import { getInvitationPreview } from "@/lib/auth/invitation";
import { inviteTokenSchema } from "@/features/auth/schemas";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Join your team", robots: { index: false, follow: false } };

export default function JoinPage({ searchParams }: PageProps<"/join">) {
  return (
    <>
      <AuthTopBar linkLabel="Log in" href="/login" />
      <Suspense fallback={<div className="mx-auto h-64 w-full max-w-md" aria-hidden />}>
        <JoinContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function JoinContent({ searchParams }: Pick<PageProps<"/join">, "searchParams">) {
  await connection();
  const query = await searchParams;
  const token = inviteTokenSchema.safeParse(Array.isArray(query.token) ? query.token[0] : query.token);
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const signedIn = Boolean(claims?.claims?.sub);
  const sessionEmail = typeof claims?.claims?.email === "string" ? claims.claims.email.toLowerCase() : null;
  const preview = token.success ? await getInvitationPreview(token.data) : null;
  // Sesión abierta con OTRA cuenta (p. ej. la del dueño que invitó): no se acepta con ella.
  const wrongAccount = Boolean(signedIn && preview && sessionEmail !== preview.email.toLowerCase());

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 py-10">
      <AuthHeading
        step="Team invitation"
        title="You were invited to join a team"
        description={
          preview
            ? `${preview.businessName} invited ${preview.email} to manage orders with the team.`
            : "This invitation isn't valid anymore. It may have expired or been used. Ask the business owner to send you a new one."
        }
      />
      {preview && token.success ? (
        wrongAccount ? (
          <form action={signOutToJoin.bind(null, token.data)} className="flex flex-col gap-3">
            <p className="rounded-lg border border-border bg-canvas p-3 text-sm text-fg">
              You&apos;re signed in with another account in this browser. This invitation is for <strong>{preview.email}</strong>. Sign out to continue as that person.
            </p>
            <button type="submit" className="inline-flex h-12 items-center justify-center rounded-xl bg-black px-6 text-sm font-medium text-white sm:h-11 sm:w-fit">
              Sign out and continue
            </button>
          </form>
        ) : signedIn ? (
          <JoinButton token={token.data} />
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href={`/register?invite=${token.data}`} className="inline-flex h-12 items-center justify-center rounded-xl bg-black px-6 text-sm font-medium text-white sm:h-11">
              Create my account
            </Link>
            <Link href={`/login?next=${encodeURIComponent(`/join?token=${token.data}`)}`} className="inline-flex h-12 items-center justify-center rounded-xl border border-border px-6 text-sm font-medium text-fg sm:h-11">
              I already have an account
            </Link>
          </div>
        )
      ) : null}
    </div>
  );
}
