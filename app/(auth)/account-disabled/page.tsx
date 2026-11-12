/**
 * /account-disabled — Comercio o cuenta suspendidos por la plataforma.
 * No muestra el motivo interno (puede contener información sensible); solo cómo pedir ayuda.
 * Al abrirse, cierra la sesión que pudiera quedar en este navegador.
 */
import Link from "next/link";
import type { Metadata } from "next";
import { AuthHeading, AuthTopBar } from "@/components/auth/auth-header";
import { EndDisabledSession } from "@/features/auth/components/EndDisabledSession";

export const metadata: Metadata = { title: "Account disabled" };

export default function AccountDisabledPage() {
  return (
    <>
      <EndDisabledSession />
      <AuthTopBar linkLabel="Log in" href="/login" />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 py-10">
        <span className="grid size-12 place-items-center rounded-2xl bg-danger/10 text-danger-strong">
          <i className="ki-filled ki-shield-cross text-2xl" aria-hidden />
        </span>
        <AuthHeading
          step="Account status"
          title="Your account is disabled"
          description="Access to this business has been disabled. If you think this is a mistake, contact support."
        />
        <Link
          href="/login"
          className="inline-flex h-12 items-center justify-center rounded-xl bg-black px-6 text-sm font-medium text-white sm:h-11 sm:w-fit"
        >
          Back to log in
        </Link>
      </div>
    </>
  );
}
