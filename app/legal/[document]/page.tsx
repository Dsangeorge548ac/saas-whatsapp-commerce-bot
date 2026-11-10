/**
 * /legal/terms y /legal/privacy — Marcadores de posición.
 * El texto legal real lo debe redactar un abogado antes del lanzamiento.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/brand/logo";

const DOCUMENTS = {
  terms: "Terms of Service",
  privacy: "Privacy Policy",
} as const;

export function generateStaticParams() {
  return Object.keys(DOCUMENTS).map((document) => ({ document }));
}

export default async function LegalPage({ params }: PageProps<"/legal/[document]">) {
  const { document } = await params;
  if (!(document in DOCUMENTS)) notFound();
  const title = DOCUMENTS[document as keyof typeof DOCUMENTS];

  return (
    <main className="mx-auto w-full flex-1 px-5 py-12">
      <Link href="/register">
        <Logo />
      </Link>
      <h1 className="mt-10 text-3xl font-medium tracking-tight text-fg">{title}</h1>
      <p className="mt-4 text-sm text-fg-muted">This document is being prepared and will be published before launch.</p>
    </main>
  );
}
