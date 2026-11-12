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
      <StoreHeader name={business.name} accent={business.accent_color} slug={slug} hasLogo={business.has_logo} isOpen={business.is_open} whatsapp={business.whatsapp} backHref={token ? `/s/${slug}?t=${token}` : `/s/${slug}`} />
      <main className="mx-auto max-w-7xl px-4 sm:px-6">
        {!page.available || !page.publication ? (
          <p className="mx-auto max-w-md py-24 text-center text-sm text-fg-muted">Esta tienda no está disponible temporalmente. Por favor, vuelve a consultar más tarde.</p>
        ) : (
          <>
            {page.publication.description ? (
              <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-fg-muted">{page.publication.description}</p>
            ) : null}
            <div className="mt-2">
              <StoreCards
                items={(page.items ?? []).map((item) => ({
                  id: item.id,
                  name: item.name,
                  description: item.description,
                  price: item.price,
                  priceVisible: item.price_visible,
                  hasImage: item.has_image,
                  categoryId: item.category_id ?? null,
                }))}
                currency={business.currency ?? "USD"}
                token={token}
                whatsapp={business.whatsapp ?? null}
                accent={safeBrandColor(business.accent_color)}
                businessName={business.name}
                acceptsDelivery={business.accepts_delivery ?? true}
                acceptsPickup={business.accepts_pickup ?? false}
                sectionTitle={page.publication.title}
              />
            </div>
          </>
        )}
      </main>
    </>
  );
}
