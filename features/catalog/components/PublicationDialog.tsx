"use client";
/**
 * Diálogo para crear o editar una publicación (catálogo público): título, descripción y los productos que
 * se muestran como tarjetas. Hasta 60 productos. Se valida aquí (Zod) y otra vez en la Server Action.
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Field, TextInput } from "@/components/forms/field";
import { FormAlert, SubmitButton } from "@/components/forms/form-feedback";
import { notify } from "@/components/feedback/notify";
import { createPublication, updatePublication } from "@/features/catalog/actions/publications";
import { publicationFormSchema, type PublicationFormInput, type PublicationFormValues } from "@/features/catalog/schemas";

export type PublicationItem = { id: string; title: string; description: string | null; status: string; productIds: string[] };
type Props = { products: { id: string; name: string }[]; publication?: PublicationItem; children: React.ReactNode };

const MAX_PRODUCTS = 60;

export function PublicationDialog({ products, publication, children }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(publication?.productIds ?? []));
  const [filter, setFilter] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PublicationFormInput, unknown, PublicationFormValues>({
    resolver: zodResolver(publicationFormSchema),
    defaultValues: { title: publication?.title ?? "", description: publication?.description ?? "" },
    mode: "onTouched",
  });

  const visible = useMemo(() => products.filter((product) => product.name.toLowerCase().includes(filter.trim().toLowerCase())), [products, filter]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_PRODUCTS) next.add(id);
      return next;
    });
  }

  function onSubmit(values: PublicationFormValues) {
    setServerError(null);
    startTransition(async () => {
      const payload = { title: values.title, description: values.description, productIds: [...selected] };
      const result = publication ? await updatePublication(publication.id, payload) : await createPublication(payload);
      if (!result.ok) return setServerError(result.error);
      notify.success(publication ? "Catalog updated" : "Catalog created", publication ? undefined : "Publish it when you're ready to share it.");
      setOpen(false);
      if (!publication) {
        reset();
        setSelected(new Set());
      }
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{publication ? "Edit catalog" : "New catalog"}</DialogTitle>
          <DialogDescription>A catalog is a page with cards for the products you choose. Customers open it from WhatsApp and pick quantities.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          {serverError ? <FormAlert>{serverError}</FormAlert> : null}
          <Field label="Title" required error={errors.title?.message}>
            {(props) => <TextInput {...props} {...register("title")} placeholder="e.g. Today's breads" />}
          </Field>
          <Field label="Description" error={errors.description?.message} hint="Optional. Shown under the title.">
            {(props) => <Textarea {...props} {...register("description")} rows={2} />}
          </Field>

          <fieldset>
            <legend className="text-xs font-medium text-fg">
              Products <span className="font-normal text-fg-muted">({selected.size} of {MAX_PRODUCTS} selected)</span>
            </legend>
            {products.length === 0 ? (
              <p className="mt-2 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-fg-muted">Add products first, then choose them here.</p>
            ) : (
              <>
                <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search products" aria-label="Search products" className="mt-2 h-9 w-full rounded-lg border border-border px-3 text-sm outline-none focus:border-black" />
                <ul className="mt-2 max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                  {visible.map((product) => (
                    <li key={product.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-canvas">
                        <input type="checkbox" checked={selected.has(product.id)} onChange={() => toggle(product.id)} className="size-4 cursor-pointer rounded border-border accent-black" />
                        <span className="truncate">{product.name}</span>
                      </label>
                    </li>
                  ))}
                  {visible.length === 0 ? <li className="px-3 py-4 text-center text-xs text-fg-muted">No products match.</li> : null}
                </ul>
              </>
            )}
          </fieldset>

          <DialogFooter>
            <SubmitButton pending={isPending} className="sm:w-auto sm:px-6">{publication ? "Save changes" : "Create catalog"}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
