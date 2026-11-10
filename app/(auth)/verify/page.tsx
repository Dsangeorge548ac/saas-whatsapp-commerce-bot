/**
 * /verify — Paso 2: verificar el email con un código de 6 dígitos.
 *
 * Decide en el servidor:
 *   - Con sesión (email ya confirmado) → /dashboard.
 *   - Sin sesión pero con email pendiente (cookie httpOnly) → formulario del código.
 *   - Sin nada → /login.
 * Lee cookies, así que el contenido va dentro de <Suspense> (Next 16 + Cache Components).
 */
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";
import { AuthHeading, AuthTopBar } from "@/components/auth/auth-header";
import { FormNote } from "@/components/forms/form-feedback";
import { OtpVerification } from "@/features/auth/components/OtpVerification";
import { maskEmail } from "@/lib/auth/mask";
import { getPendingEmail } from "@/lib/auth/pending-signup";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Verify your email" };

export default function VerifyPage() {
  return (
    <>
      <AuthTopBar linkLabel="Log in" href="/login" />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 py-10">
        <AuthHeading
          step="02 / Verification"
          title="Verify your email"
          description="We confirm your email before you can access your workspace."
        />
        <Suspense fallback={<div className="h-72 animate-pulse rounded-2xl bg-canvas" aria-hidden />}>
          <VerifyContent />
        </Suspense>
        <FormNote>Codes expire after a few minutes. Never share them with anyone.</FormNote>
      </div>
    </>
  );
}

async function VerifyContent() {
  await connection(); // Depende de la sesión y de la hora (códigos que caducan): solo en tiempo de petición.
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.sub) redirect("/dashboard");

  const pendingEmail = await getPendingEmail();
  if (!pendingEmail) redirect("/login");
  return <OtpVerification maskedEmail={maskEmail(pendingEmail)} />;
}
