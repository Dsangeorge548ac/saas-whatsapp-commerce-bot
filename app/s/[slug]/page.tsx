/**
 * Portada de la tienda pública: lista las publicaciones (catálogos) publicadas del comercio.
 * Pública y sin datos personales. Si el comercio no tiene suscripción vigente se muestra "no disponible".
 */
import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Store } from "lucide-react";
import { StoreHeader } from "@/features/storefront/components/StoreHeader";
import { getStorefront } from "@/features/storefront/queries";

export async function generateMetadata({ params }: PageProps<"/s/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: slug };
}

export default function StorePage({ params }: PageProps<"/s/[slug]">) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse bg-canvas" aria-busy="true" />}>
      <StoreContent params={params} />
    </Suspense>
  );
}

async function StoreContent({ params }: { params: PageProps<"/s/[slug]">["params"] }) {
  const { slug } = await params;
  const store = await getStorefront(slug);
  if (!store || !store.business) notFound();

  const business = store.business;
  return (
    <>
      <StoreHeader name={business.name} accent={business.accent_color} />
      <main className="mx-auto max-w-5xl px-4 py-10">
        {!store.available ? (
          <p className="mx-auto max-w-md text-center text-sm text-fg-muted">This store is temporarily unavailable. Please check back soon.</p>
        ) : store.publications?.length ? (
          <>
            <h1 className="text-2xl font-medium tracking-tight text-fg">Our catalogs</h1>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2">
              {store.publications.map((publication) => (
                <li key={publication.id}>
                  <Link href={`/c/${publication.id}`} className="flex h-full flex-col gap-1 rounded-lg border border-border bg-surface p-5 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-black">
                    <span className="grid size-10 place-items-center rounded-lg bg-canvas text-fg">
                      <Store className="size-5" aria-hidden />
                    </span>
                    <span className="mt-2 text-base font-semibold text-fg">{publication.title}</span>
                    {publication.description ? <span className="line-clamp-2 text-sm text-fg-muted">{publication.description}</span> : null}
                    <span className="mt-auto pt-3 text-xs text-fg-muted">{publication.item_count} products</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mx-auto max-w-md text-center text-sm text-fg-muted">No catalogs published yet.</p>
        )}
      </main>
    </>
  );
}
