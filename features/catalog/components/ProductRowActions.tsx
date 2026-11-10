"use client";
/**
 * Acciones de una fila de producto: editar, mostrar/ocultar y borrar (con confirmación).
 * Solo el dueño las ve; cada Server Action vuelve a comprobarlo en el servidor.
 */
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/feedback/sweet-confirm";
import { notify } from "@/components/feedback/notify";
import { deleteProduct, setProductAvailability } from "@/features/catalog/actions/products";
import { ProductDialog } from "@/features/catalog/components/ProductDialog";
import type { ProductRow } from "@/features/catalog/queries";

type Props = { tenantId: string; categories: { id: string; name: string }[]; product: ProductRow };

export function ProductRowActions({ tenantId, categories, product }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const result = await setProductAvailability(product.id, !product.is_available);
      if (!result.ok) return notify.error(result.error);
      router.refresh();
    });
  }

  async function remove() {
    const answer = await confirmAction({
      title: `Delete "${product.name}"?`,
      text: "It will disappear from your catalogs. Past orders keep their name and price.",
      confirmLabel: "Delete product",
      tone: "danger",
    });
    if (!answer.confirmed) return;
    startTransition(async () => {
      const result = await deleteProduct(product.id);
      if (!result.ok) return notify.error(result.error);
      notify.success("Product deleted");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="ghost" size="icon-sm" onClick={toggle} disabled={isPending} aria-label={product.is_available ? `Hide ${product.name}` : `Show ${product.name}`} title={product.is_available ? "Hide (out of stock)" : "Show"}>
        {product.is_available ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
      </Button>
      <ProductDialog tenantId={tenantId} categories={categories} product={product}>
        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${product.name}`} title="Edit">
          <Pencil aria-hidden />
        </Button>
      </ProductDialog>
      <Button variant="ghost" size="icon-sm" onClick={remove} disabled={isPending} aria-label={`Delete ${product.name}`} title="Delete">
        <Trash2 aria-hidden />
      </Button>
    </div>
  );
}
