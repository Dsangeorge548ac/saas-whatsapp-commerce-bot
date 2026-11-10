/**
 * /catalog — Productos, categorías y catálogos públicos del comercio. Se configura GRATIS (no exige
 * suscripción). El dueño edita; los operadores solo consultan. Filtros y página viven en la URL, se
 * validan con Zod y la paginación se hace en la base de datos.
 */
import { Suspense } from "react";
import type { Metadata } from "next";
import { LayoutGrid, Package, Tags } from "lucide-react";
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
  products: <Package />,
  categories: <Tags />,
  catalogs: <LayoutGrid />,
};

export default function CatalogPage({ searchParams }: PageProps<"/catalog">) {
  return (
    <Suspense fallback={<div className="h-72 animate-pulse rounded-lg bg-canvas" aria-busy="true" />}>
      <CatalogContent searchParams={searchParams} />
    </Suspense>
  );
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

  const supabase = await createClient();
  const { data: settings } = await supabase.from("tenant_settings").select("currency").eq("tenant_id", membership.tenant_id).maybeSingle();

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

      <SectionTabs
        label="Catalog sections"
        tabs={TABS.map((item) => ({ href: `/catalog?tab=${item.id}`, label: item.label, icon: TAB_ICONS[item.id], active: tab === item.id }))}
      />

      {tab === "products" ? <ProductsPanel tenantId={membership.tenant_id} currency={settings?.currency ?? "USD"} canEdit={canEdit} params={params} /> : null}
      {tab === "categories" ? <CategoriesPanel categories={await listCategories(membership.tenant_id)} canEdit={canEdit} /> : null}
      {tab === "catalogs" ? <PublicationsPanel tenantId={membership.tenant_id} slug={membership.slug} canEdit={canEdit} /> : null}
    </div>
  );
}
