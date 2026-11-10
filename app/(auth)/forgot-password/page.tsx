/**
 * /forgot-password — Recuperar la contraseña con un código de 6 dígitos.
 */
import type { Metadata } from "next";
import { AuthHeading, AuthTopBar } from "@/components/auth/auth-header";
import { ForgotPasswordForm } from "@/features/auth/components/ForgotPasswordForm";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <AuthTopBar prompt="Remembered it?" linkLabel="Log in" href="/login" />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 py-10">
        <AuthHeading
          step="Account recovery"
          title="Reset your password"
          description="We'll email you a 6-digit code. For your security, other devices will be signed out after the change."
        />
        <ForgotPasswordForm />
      </div>
    </>
  );
}
