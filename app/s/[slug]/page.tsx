/**
 * Portada de la tienda pública (<slug>.<dominio>): TODOS los productos disponibles del comercio, con búsqueda y
 * categorías, y arriba las colecciones (catálogos publicados) si las hay.
 *
 * Con enlace personal (?t=<token>, lo manda el bot por WhatsApp) el cliente arma su pedido y lo envía; sin él la
 * página es de consulta y ofrece escribir por WhatsApp. El token solo se pasa al componente cliente si tiene la
 * forma esperada; la base lo valida de verdad al enviar (un solo uso, 24 h).
 * Pública y sin datos personales. Si el comercio no tiene suscripción vigente se muestra "no disponible".
 */
import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { safeBrandColor } from "@/lib/storefront/color";
import { StoreCards } from "@/features/storefront/components/StoreCards";
import { StoreHeader } from "@/features/storefront/components/StoreHeader";
import { getStorefront } from "@/features/storefront/queries";
import { orderTokenSchema } from "@/features/storefront/schemas";

export async function generateMetadata({ params }: PageProps<"/s/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: slug, robots: { index: false, follow: false } };
}

export default function StorePage({ params, searchParams }: PageProps<"/s/[slug]">) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse bg-canvas" aria-busy="true" />}>
      <StoreContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function StoreContent({ params, searchParams }: Pick<PageProps<"/s/[slug]">, "params" | "searchParams">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const store = await getStorefront(slug);
  if (!store || !store.business) notFound();

  const business = store.business;
  const rawToken = typeof query.t === "string" ? query.t : null;
  const token = rawToken && orderTokenSchema.safeParse(rawToken).success ? rawToken : null;
  const accent = safeBrandColor(business.accent_color);
  const collections = store.publications ?? [];

  return (
    <>
      <StoreHeader name={business.name} accent={business.accent_color} slug={slug} hasLogo={business.has_logo} isOpen={business.is_open} whatsapp={business.whatsapp} />
      <main className="mx-auto max-w-7xl px-4 sm:px-6">
        {!store.available ? (
          <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center">
            <i className="ki-filled ki-shop text-4xl text-fg-muted" aria-hidden />
            <h1 className="text-xl font-medium text-fg">Esta tienda no está disponible temporalmente</h1>
            <p className="text-sm text-fg-muted">Por favor, vuelve a consultar más tarde.</p>
          </div>
        ) : (
          <>
            {collections.length > 0 ? (
              <section aria-labelledby="collections" className="pt-6 pb-2">
                <h2 id="collections" className="mb-3 text-sm font-bold uppercase tracking-wider text-fg-muted">Colecciones destacadas</h2>
                <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-6 sm:px-6">
                  {collections.map((collection) => (
                    <li key={collection.id} className="w-64 shrink-0">
                      <Link href={`/s/${slug}/c/${collection.id}${token ? `?t=${token}` : ""}`} className="group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-surface transition-shadow hover:shadow-md">
                        {collection.has_cover ? (
                          <div className="aspect-[16/9] bg-canvas">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`/api/public-files/cover/${collection.id}`} alt="" loading="lazy" className="size-full object-cover" />
                          </div>
                        ) : null}
                        <div className="flex items-center gap-3 p-3">
                          {!collection.has_cover ? (
                            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-canvas"><i className="ki-filled ki-element-11 text-xl" style={{ color: accent }} aria-hidden /></span>
                          ) : null}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-fg">{collection.title}</p>
                            <p className="text-xs text-fg-muted">{collection.item_count} {collection.item_count === 1 ? "producto" : "productos"}</p>
                          </div>
                          <i className="ki-filled ki-right text-xs text-fg-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section aria-labelledby="products">
              <h2 id="products" className="sr-only">Productos</h2>
              <StoreCards
                items={(store.products ?? []).map((item) => ({
                  id: item.id,
                  name: item.name,
                  description: item.description,
                  price: item.price,
                  priceVisible: item.price_visible,
                  hasImage: item.has_image,
                  categoryId: item.category_id ?? null,
                }))}
                categories={store.categories ?? []}
                currency={business.currency ?? "USD"}
                token={token}
                whatsapp={business.whatsapp ?? null}
                accent={accent}
                businessName={business.name}
                acceptsDelivery={business.accepts_delivery ?? true}
                acceptsPickup={business.accepts_pickup ?? false}
                sectionTitle="Ofertas destacadas"
              />
            </section>
          </>
        )}
      </main>
    </>
  );
}
