/**
 * /login — Inicio de sesión.
 * El formulario lee ?next= de la URL; por eso va dentro de <Suspense> (requisito de Next 16
 * con Cache Components): el resto de la página se sirve estática al instante.
 */
import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthHeading, AuthTopBar } from "@/components/auth/auth-header";
import { FormNote } from "@/components/forms/form-feedback";
import { LoginForm } from "@/features/auth/components/LoginForm";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <>
      <AuthTopBar prompt="New here?" linkLabel="Create account" href="/register" />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 py-10">
        <AuthHeading step="Welcome back" title="Log in to your workspace" description="Use the email and password you registered with." />
        <Suspense fallback={<div className="h-64" aria-hidden />}>
          <LoginForm />
        </Suspense>
        <FormNote>Your session is protected. We never ask for your password by email or chat.</FormNote>
      </div>
    </>
  );
}
