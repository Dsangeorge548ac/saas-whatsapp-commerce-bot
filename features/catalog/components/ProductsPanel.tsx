/**
 * Pestaña "Products": búsqueda, filtro por categoría, tabla paginada en el servidor y alta de productos.
 * Los filtros viven en la URL (TableToolbar). Los operadores ven la lista sin controles
 * de edición; las acciones del dueño vuelven a comprobar el rol en el servidor.
 */
import { ImageOff, Package, Plus } from "lucide-react";
import { EmptyState, Pagination, TableCard, rowClass, tdClass, thClass, theadClass } from "@/components/data/data-table";
import { TableToolbar } from "@/components/data/table-toolbar";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/layout/status-badge";
import { formatMoney } from "@/lib/whatsapp/format";
import { ProductDialog } from "@/features/catalog/components/ProductDialog";
import { ProductRowActions } from "@/features/catalog/components/ProductRowActions";
import { listCategories, listProducts } from "@/features/catalog/queries";
import type { ProductListParams } from "@/features/catalog/schemas";

type Props = { tenantId: string; currency: string; canEdit: boolean; params: ProductListParams };

function pageHref(params: ProductListParams, page: number) {
  const query = new URLSearchParams({ tab: "products", page: String(page) });
  if (params.q) query.set("q", params.q);
  if (params.category) query.set("category", params.category);
  return `/catalog?${query.toString()}`;
}

export async function ProductsPanel({ tenantId, currency, canEdit, params }: Props) {
  const [{ rows, total, page, pageCount }, categories] = await Promise.all([listProducts(tenantId, params), listCategories(tenantId)]);
  const categoryName = new Map(categories.map((category) => [category.id, category.name]));

  return (
    <div className="flex flex-col gap-4">
      <TableToolbar
        keep={["tab"]}
        search={{ placeholder: "Search products" }}
        selects={[{ name: "category", label: "Category", allLabel: "All categories", options: [{ value: "none", label: "No category" }, ...categories.map((category) => ({ value: category.id, label: category.name }))] }]}
        action={
          canEdit ? (
            <ProductDialog tenantId={tenantId} categories={categories}>
              <Button className="w-full sm:w-auto"><Plus aria-hidden /> Add product</Button>
            </ProductDialog>
          ) : null
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={Package}
          title={total === 0 && !params.q && !params.category ? "No products yet" : "No products match your filters"}
          text={
            total === 0 && !params.q && !params.category
              ? canEdit
                ? "Add your first product: customers will see it on your catalog cards."
                : "The owner hasn't added products yet."
              : "Try another search or clear the filters."
          }
        />
      ) : (
        <TableCard minWidth="36rem">
            <thead className={theadClass}>
              <tr>
                {["Product", "Category", "Price", "Status"].map((h) => <th key={h} scope="col" className={thClass}>{h}</th>)}
                {canEdit ? <th scope="col" className={cn(thClass, "text-right")}>Actions</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((product) => (
                <tr key={product.id} className={rowClass}>
                  <td className={tdClass}>
                    <div className="flex items-center gap-3">
                      <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-canvas">
                        {product.image_path ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`/api/files/product/${product.id}`} alt="" loading="lazy" className="size-full object-cover" />
                        ) : (
                          <ImageOff className="size-4 text-chart-muted-strong" aria-hidden />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-fg">{product.name}</span>
                        {product.sku ? <span className="block truncate text-xs text-fg-muted">SKU {product.sku}</span> : null}
                      </span>
                    </div>
                  </td>
                  <td className={cn(tdClass, "text-fg-muted")}>{product.category_id ? (categoryName.get(product.category_id) ?? "—") : "—"}</td>
                  <td className={cn(tdClass, "font-medium text-fg")}>{product.price_visible ? formatMoney(product.price, currency) : <span className="text-fg-muted">Quote</span>}</td>
                  <td className={tdClass}>
                    <StatusBadge tone={product.is_available ? "success" : "neutral"}>{product.is_available ? "Available" : "Hidden"}</StatusBadge>
                  </td>
                  {canEdit ? (
                    <td className={tdClass}><ProductRowActions tenantId={tenantId} categories={categories} product={product} /></td>
                  ) : null}
                </tr>
              ))}
            </tbody>
        </TableCard>
      )}

      <Pagination page={page} pageCount={pageCount} total={total} noun={total === 1 ? "product" : "products"} href={(next) => pageHref(params, next)} />
    </div>
  );
}
