/**
 * Validaciones (Zod) del catálogo: categorías, productos y publicaciones.
 * Se usan en los formularios (errores al momento) y en las Server Actions (la validación que protege).
 * Los límites coinciden con los CHECK de la base de datos.
 */
import { z } from "zod";

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(80, "Use 80 characters or fewer."),
});

/** Precio tal como lo escribe la persona: hasta 9 enteros y 2 decimales. */
export const priceTextSchema = z
  .string()
  .trim()
  .regex(/^\d{1,9}(\.\d{1,2})?$/, "Enter a price like 4.50.");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use ${max} characters or fewer.`)
    .transform((value) => (value === "" ? null : value));

/** Ruta de una foto ya subida al bucket product-images: {tenant}/products/{uuid}.{jpg|png|webp}. */
const IMAGE_PATH = /^[0-9a-f-]{36}\/products\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

/** Formulario del producto (el precio va como texto y se convierte al enviar). */
export const productFormSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(120, "Use 120 characters or fewer."),
  description: optionalText(1000),
  price: priceTextSchema,
  priceVisible: z.boolean(),
  sku: optionalText(60),
  categoryId: z.string().transform((value) => (value === "" ? null : value)).pipe(z.uuid().nullable()),
  isAvailable: z.boolean(),
});
export type ProductFormInput = z.input<typeof productFormSchema>;
export type ProductFormValues = z.output<typeof productFormSchema>;

/** Lo que recibe la Server Action. */
export const productSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullable(),
  price: z.number().min(0).max(999_999_999.99),
  priceVisible: z.boolean(),
  sku: z.string().trim().max(60).nullable(),
  categoryId: z.uuid().nullable(),
  isAvailable: z.boolean(),
  imagePath: z.string().regex(IMAGE_PATH).nullable(),
});
export type ProductInput = z.infer<typeof productSchema>;

export const publicationFormSchema = z.object({
  title: z.string().trim().min(1, "Enter a title.").max(120, "Use 120 characters or fewer."),
  description: optionalText(500),
});
export type PublicationFormInput = z.input<typeof publicationFormSchema>;
export type PublicationFormValues = z.output<typeof publicationFormSchema>;

export const publicationSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable(),
  productIds: z.array(z.uuid()).max(60, "A catalog can have up to 60 products."),
});
export type PublicationInput = z.infer<typeof publicationSchema>;

/** Filtros de la lista de productos (viven en la URL; se validan y se corrigen). */
export const productListParamsSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  q: z.string().trim().max(80).catch(""),
  category: z.union([z.uuid(), z.literal("none")]).optional().catch(undefined),
});
export type ProductListParams = z.infer<typeof productListParamsSchema>;

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };
export const NOT_FOUND: ActionResult = { ok: false, error: "Not found." };
