/**
 * Catálogo público (una publicación): tarjetas con foto, nombre, precio y descripción.
 *
 * Con enlace personal (?t=<token>, lo manda el bot por WhatsApp) el cliente arma su pedido y lo envía;
 * sin él la página es solo de consulta y ofrece abrir el chat. El token solo se pasa al componente
 * cliente si tiene la forma esperada; la base lo valida de verdad al enviar (un solo uso, 24 h).
 * Privacidad: la página no pide ni muestra datos personales, y no se indexa (noindex) porque el enlace
 * personal no debe aparecer en buscadores.
 */
import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { safeBrandColor } from "@/lib/storefront/color";
import { StoreCards } from "@/features/storefront/components/StoreCards";
import { StoreHeader } from "@/features/storefront/components/StoreHeader";
import { orderTokenSchema } from "@/features/storefront/schemas";
import { getPublicationPage } from "@/features/storefront/queries";

export const metadata: Metadata = { title: "Catalog", robots: { index: false, follow: false } };

export default function PublicationPage({ params, searchParams }: PageProps<"/s/[slug]/c/[publicationId]">) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse bg-canvas" aria-busy="true" />}>
      <PublicationContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function PublicationContent({
  params,
  searchParams,
}: Pick<PageProps<"/s/[slug]/c/[publicationId]">, "params" | "searchParams">) {
  const [{ slug, publicationId }, query] = await Promise.all([params, searchParams]);
  const page = await getPublicationPage(slug, publicationId);
  if (!page || !page.business) notFound();

  const business = page.business;
  const rawToken = typeof query.t === "string" ? query.t : null;
  const token = rawToken && orderTokenSchema.safeParse(rawToken).success ? rawToken : null;

  return (
    <>
      <StoreHeader name={business.name} accent={business.accent_color} backHref="/" />
      <main className="mx-auto max-w-5xl px-4 py-8">
        {!page.available || !page.publication ? (
          <p className="mx-auto max-w-md text-center text-sm text-fg-muted">This store is temporarily unavailable. Please check back soon.</p>
        ) : (
          <>
            <h1 className="text-2xl font-medium tracking-tight text-fg">{page.publication.title}</h1>
            {page.publication.description ? <p className="mt-2 max-w-2xl text-sm text-fg-muted">{page.publication.description}</p> : null}
            <div className="mt-6">
              <StoreCards
                items={(page.items ?? []).map((item) => ({
                  id: item.id,
                  name: item.name,
                  description: item.description,
                  price: item.price,
                  priceVisible: item.price_visible,
                  hasImage: item.has_image,
                }))}
                currency={business.currency ?? "USD"}
                token={token}
                whatsapp={business.whatsapp ?? null}
                accent={safeBrandColor(business.accent_color)}
                businessName={business.name}
              />
            </div>
          </>
        )}
      </main>
    </>
  );
}
