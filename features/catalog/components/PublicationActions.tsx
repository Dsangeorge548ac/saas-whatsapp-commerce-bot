"use client";
/**
 * Acciones de una publicación: publicar/despublicar, copiar el enlace de la tienda, editar y borrar.
 * Publicar la hace visible en la tienda pública (<comercio>.<dominio>); despublicar la oculta al instante.
 * Solo el dueño las ve; cada Server Action vuelve a comprobarlo.
 */
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/feedback/sweet-confirm";
import { notify } from "@/components/feedback/notify";
import { deletePublication, setPublicationStatus } from "@/features/catalog/actions/publications";
import { PublicationDialog, type PublicationItem } from "@/features/catalog/components/PublicationDialog";

type Props = { publication: PublicationItem; products: { id: string; name: string }[]; shareUrl: string };

export function PublicationActions({ publication, products, shareUrl }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const published = publication.status === "published";

  function togglePublished() {
    startTransition(async () => {
      const result = await setPublicationStatus(publication.id, published ? "draft" : "published");
      if (!result.ok) return notify.error(result.error);
      notify.success(published ? "Catalog unpublished" : "Catalog published", published ? undefined : "Customers can now see it on your store page.");
      router.refresh();
    });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      notify.success("Link copied");
    } catch {
      notify.error("We couldn't copy the link. Select it and copy it manually.");
    }
  }

  async function remove() {
    const answer = await confirmAction({ title: `Delete "${publication.title}"?`, text: "The page stops existing. Your products are not deleted.", confirmLabel: "Delete catalog", tone: "danger" });
    if (!answer.confirmed) return;
    startTransition(async () => {
      const result = await deletePublication(publication.id);
      if (!result.ok) return notify.error(result.error);
      notify.success("Catalog deleted");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant={published ? "outline" : "default"} size="sm" onClick={togglePublished} disabled={isPending}>
        {published ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
        {published ? "Unpublish" : "Publish"}
      </Button>
      {published ? (
        <Button variant="outline" size="sm" onClick={copyLink}>
          <Copy aria-hidden /> Copy link
        </Button>
      ) : null}
      <PublicationDialog products={products} publication={publication}>
        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${publication.title}`} title="Edit">
          <Pencil aria-hidden />
        </Button>
      </PublicationDialog>
      <Button variant="ghost" size="icon-sm" onClick={remove} disabled={isPending} aria-label={`Delete ${publication.title}`} title="Delete">
        <Trash2 aria-hidden />
      </Button>
    </div>
  );
}
