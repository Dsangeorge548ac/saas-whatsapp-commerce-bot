/**
 * Pestaña "Catalogs": las publicaciones del comercio (borrador o publicadas) y la dirección de su tienda.
 * Cada catálogo publicado es una página pública con tarjetas; el bot envía su enlace por WhatsApp.
 * Los operadores solo ven la lista; el dueño puede crear, editar, publicar y borrar.
 */
import { Plus, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/layout/status-badge";
import { storeUrl } from "@/lib/storefront/url";
import { PublicationActions } from "@/features/catalog/components/PublicationActions";
import { PublicationDialog } from "@/features/catalog/components/PublicationDialog";
import { listProductOptions, listPublications } from "@/features/catalog/queries";

type Props = { tenantId: string; slug: string; canEdit: boolean };

export async function PublicationsPanel({ tenantId, slug, canEdit }: Props) {
  const [publications, products] = await Promise.all([listPublications(tenantId), listProductOptions(tenantId)]);
  const home = storeUrl(slug, "/");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-canvas p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium text-fg-muted">Your store address</p>
          <p className="truncate text-sm font-medium text-fg">{home.replace(/^https?:\/\//, "")}</p>
        </div>
        {canEdit ? (
          <PublicationDialog products={products}>
            <Button><Plus aria-hidden /> New catalog</Button>
          </PublicationDialog>
        ) : null}
      </div>

      {publications.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-14 text-center">
          <p className="text-sm font-medium text-fg">No catalogs yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-fg-muted">
            {canEdit
              ? "Create a catalog with the products you want to show. The bot sends customers a link to it so they can pick quantities and order."
              : "The owner hasn't created a catalog yet."}
          </p>
        </div>
      ) : (
        <ul className="grid gap-3">
          {publications.map((publication) => (
            <li key={publication.id} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-center">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-canvas text-fg">
                <Store className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
                  <span className="truncate">{publication.title}</span>
                  <StatusBadge tone={publication.status === "published" ? "success" : "neutral"}>{publication.status === "published" ? "Published" : "Draft"}</StatusBadge>
                </p>
                <p className="text-xs text-fg-muted">{publication.productIds.length} products{publication.description ? ` · ${publication.description}` : ""}</p>
              </div>
              {canEdit ? <PublicationActions publication={publication} products={products} shareUrl={storeUrl(slug, `/c/${publication.id}`)} /> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
