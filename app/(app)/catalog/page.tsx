/**
 * /catalog — Productos, categorías y catálogos públicos del comercio. Se configura GRATIS (no exige
 * suscripción). El dueño edita; los operadores solo consultan. Filtros y página viven en la URL, se
 * validan con Zod y la paginación se hace en la base de datos.
 */
import { Suspense } from "react";
import type { Metadata } from "next";
import { storeUrl } from "@/lib/storefront/url";
import { SectionTabs } from "@/components/layout/section-tabs";
import { Alert } from "@/components/feedback/alert";
import { CategoriesPanel } from "@/features/catalog/components/CategoriesPanel";
import { ProductsPanel } from "@/features/catalog/components/ProductsPanel";
import { PublicationsPanel } from "@/features/catalog/components/PublicationsPanel";
import { listCategories } from "@/features/catalog/queries";
import { productListParamsSchema } from "@/features/catalog/schemas";
import { currentMembership, requireWorkspace } from "@/lib/data/workspace";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Catalog" };

const TABS = [
  { id: "products", label: "Products" },
  { id: "categories", label: "Categories" },
  { id: "catalogs", label: "Catalogs" },
] as const;

const TAB_ICONS: Record<(typeof TABS)[number]["id"], React.ReactNode> = {
  products: <i className="ki-filled ki-package" />,
  categories: <i className="ki-filled ki-price-tag" />,
  catalogs: <i className="ki-filled ki-element-11" />,
};

export default function CatalogPage({ searchParams }: PageProps<"/catalog">) {
  return (
    <Suspense fallback={<div className="h-72 animate-pulse rounded-lg bg-canvas" aria-busy="true" />}>
      <CatalogContent searchParams={searchParams} />
    </Suspense>
  );
}

async function loadCurrency(tenantId: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.from("tenant_settings").select("currency").eq("tenant_id", tenantId).maybeSingle();
  return data?.currency ?? "USD";
}

async function CatalogContent({ searchParams }: Pick<PageProps<"/catalog">, "searchParams">) {
  const query = await searchParams;
  const membership = currentMembership(await requireWorkspace());
  if (!membership) {
    return <Alert tone="warning" title="We couldn't find your business">Sign out and log in again to finish creating it.</Alert>;
  }

  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const tab = TABS.find((item) => item.id === first(query.tab))?.id ?? "products";
  const params = productListParamsSchema.parse({ page: first(query.page), q: first(query.q), category: first(query.category) });
  const canEdit = membership.role === "owner";

  // La moneda se pide SIN esperar: el panel la espera a la vez que sus productos (una sola ronda a la base).
  const currency = loadCurrency(membership.tenant_id);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-medium tracking-tight text-fg">Catalog</h1>
        <p className="mt-1 text-sm text-fg-muted">
          {canEdit
            ? "Add your products, then group them into catalogs. Customers open a catalog from WhatsApp, choose quantities and send their order."
            : "The products and catalogs your customers can order from."}
        </p>
      </header>

      {/* Dirección de la tienda pública: ahí aparecen TODOS los productos disponibles. */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-black text-white"><i className="ki-filled ki-geolocation text-xl text-white" aria-hidden /></span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-fg-muted">Your public store · every available product appears here</p>
            <p className="truncate text-sm font-semibold text-fg">{storeUrl(membership.slug, "/").replace(/^https?:\/\//, "").replace(/\/$/, "")}</p>
          </div>
        </div>
        <a href={storeUrl(membership.slug, "/")} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium text-fg hover:bg-muted">
          Open store <i className="ki-filled ki-arrow-up-right text-sm" aria-hidden />
        </a>
      </div>

      <SectionTabs
        label="Catalog sections"
        tabs={TABS.map((item) => ({ href: `/catalog?tab=${item.id}`, label: item.label, icon: TAB_ICONS[item.id], active: tab === item.id }))}
      />

      {tab === "products" ? <ProductsPanel tenantId={membership.tenant_id} currency={currency} canEdit={canEdit} params={params} /> : null}
      {tab === "categories" ? <CategoriesPanel categories={await listCategories(membership.tenant_id)} canEdit={canEdit} /> : null}
      {tab === "catalogs" ? <PublicationsPanel tenantId={membership.tenant_id} slug={membership.slug} canEdit={canEdit} /> : null}
    </div>
  );
}
