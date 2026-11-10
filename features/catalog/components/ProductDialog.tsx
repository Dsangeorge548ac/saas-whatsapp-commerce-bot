"use client";
/**
 * Diálogo para crear o editar un producto (solo el dueño lo ve).
 *
 * Campos: nombre, descripción, precio, "mostrar precio" (si no, se cotiza con un asesor), SKU, categoría,
 * disponibilidad y foto. La foto se sube desde el navegador al bucket PRIVADO product-images, dentro de la
 * carpeta del comercio (la política de Storage lo exige); la Server Action solo guarda la ruta.
 * Validación: React Hook Form + Zod aquí (errores al momento) y otra vez en la Server Action.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ImageOff } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Field, SelectInput, TextInput } from "@/components/forms/field";
import { FormAlert, SubmitButton } from "@/components/forms/form-feedback";
import { notify } from "@/components/feedback/notify";
import { createClient } from "@/lib/supabase/client";
import { createProduct, updateProduct } from "@/features/catalog/actions/products";
import { productFormSchema, type ProductFormInput, type ProductFormValues } from "@/features/catalog/schemas";
import type { ProductRow } from "@/features/catalog/queries";

const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type Props = { tenantId: string; categories: { id: string; name: string }[]; product?: ProductRow; children: React.ReactNode };

export function ProductDialog({ tenantId, categories, product, children }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProductFormInput, unknown, ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: product?.name ?? "",
      description: product?.description ?? "",
      price: product ? String(product.price) : "",
      priceVisible: product?.price_visible ?? true,
      sku: product?.sku ?? "",
      categoryId: product?.category_id ?? "",
      isAvailable: product?.is_available ?? true,
    },
    mode: "onTouched",
  });

  const previewUrl = file ? URL.createObjectURL(file) : product?.image_path ? `/api/files/product/${product.id}` : null;

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] ?? null;
    setFileError(null);
    if (chosen && !(chosen.type in IMAGE_TYPES)) return void setFileError("Use a JPG, PNG or WEBP image.");
    if (chosen && chosen.size > MAX_IMAGE_BYTES) return void setFileError("The image must be 5 MB or smaller.");
    setFile(chosen);
  }

  function onSubmit(values: ProductFormValues) {
    setServerError(null);
    startTransition(async () => {
      let imagePath = product?.image_path ?? null;
      if (file) {
        // Subida directa a Storage (sin pasar por el servidor): la política exige la carpeta del comercio.
        const path = `${tenantId}/products/${crypto.randomUUID()}.${IMAGE_TYPES[file.type]}`;
        const { error } = await createClient().storage.from("product-images").upload(path, file, { contentType: file.type, upsert: false });
        if (error) return setServerError("We couldn't upload the image. Try again.");
        imagePath = path;
      }
      const payload = {
        name: values.name,
        description: values.description,
        price: Number(values.price),
        priceVisible: values.priceVisible,
        sku: values.sku,
        categoryId: values.categoryId,
        isAvailable: values.isAvailable,
        imagePath,
      };
      const result = product ? await updateProduct(product.id, payload) : await createProduct(payload);
      if (!result.ok) return setServerError(result.error);
      notify.success(product ? "Product updated" : "Product added");
      setOpen(false);
      setFile(null);
      if (!product) reset();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{product ? "Edit product" : "Add product"}</DialogTitle>
          <DialogDescription>Customers see the photo, name, price and description on your catalog cards.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          {serverError ? <FormAlert>{serverError}</FormAlert> : null}

          <div className="flex items-center gap-4">
            <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-canvas">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="" className="size-full object-cover" />
              ) : (
                <ImageOff className="size-6 text-chart-muted-strong" aria-hidden />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <label htmlFor="product-image" className="text-xs font-medium text-fg">Photo</label>
              <input id="product-image" type="file" accept="image/jpeg,image/png,image/webp" onChange={onFileChange} className="mt-1 block w-full text-xs text-fg-muted file:mr-3 file:h-9 file:cursor-pointer file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:text-xs file:font-medium file:text-fg" />
              <p className={fileError ? "mt-1 text-xs text-danger-strong" : "mt-1 text-xs text-fg-muted"}>{fileError ?? "JPG, PNG or WEBP, up to 5 MB."}</p>
            </div>
          </div>

          <Field label="Name" required error={errors.name?.message}>
            {(props) => <TextInput {...props} {...register("name")} placeholder="e.g. Sourdough loaf" />}
          </Field>
          <Field label="Description" error={errors.description?.message}>
            {(props) => <Textarea {...props} {...register("description")} rows={3} placeholder="Ingredients, size, what's included…" />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Price" required error={errors.price?.message}>
              {(props) => <TextInput {...props} {...register("price")} inputMode="decimal" placeholder="4.50" />}
            </Field>
            <Field label="SKU" error={errors.sku?.message} hint="Optional code.">
              {(props) => <TextInput {...props} {...register("sku")} />}
            </Field>
          </div>
          <Field label="Category" error={errors.categoryId?.message}>
            {(props) => (
              <SelectInput {...props} {...register("categoryId")}>
                <option value="">No category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </SelectInput>
            )}
          </Field>
          <label className="flex items-start gap-3 text-sm text-fg">
            <input type="checkbox" {...register("priceVisible")} className="mt-0.5 size-4 cursor-pointer rounded border-border accent-black" />
            <span>Show the price. <span className="text-fg-muted">Turn it off to quote with an agent (customers can&apos;t order it on the web).</span></span>
          </label>
          <label className="flex items-start gap-3 text-sm text-fg">
            <input type="checkbox" {...register("isAvailable")} className="mt-0.5 size-4 cursor-pointer rounded border-border accent-black" />
            <span>Available. <span className="text-fg-muted">Turn it off when it&apos;s out of stock.</span></span>
          </label>

          <DialogFooter>
            <SubmitButton pending={isPending} className="sm:w-auto sm:px-6">{product ? "Save changes" : "Add product"}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
