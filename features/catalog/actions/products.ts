"use server";
/**
 * Server Actions de productos (solo el dueño). Patrón: comprobar dueño → validar con Zod → escribir con
 * la sesión del usuario (RLS vuelve a exigir "dueño") → auditar lo importante → refrescar la página.
 * La foto se sube desde el navegador al bucket PRIVADO product-images (la política de Storage solo permite
 * subir dentro de la carpeta del comercio); aquí solo se guarda su ruta, tras comprobar que está en la
 * carpeta de ESTE comercio.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { getOwnerContext } from "@/lib/auth/owner";
import { NOT_FOUND, productSchema, type ActionResult } from "@/features/catalog/schemas";

function toRow(tenantId: string, input: z.infer<typeof productSchema>) {
  return {
    tenant_id: tenantId,
    name: input.name,
    description: input.description,
    price: input.price,
    price_visible: input.priceVisible,
    sku: input.sku,
    category_id: input.categoryId,
    is_available: input.isAvailable,
    image_path: input.imagePath,
  };
}

function saveError(code: string | undefined): ActionResult {
  if (code === "23505") return { ok: false, error: "You already have a product with that SKU." };
  if (code === "23503") return { ok: false, error: "That category no longer exists." };
  return { ok: false, error: "We couldn't save the product." };
}

export async function createProduct(input: unknown): Promise<ActionResult> {
  const owner = await getOwnerContext();
  if (!owner) return NOT_FOUND;
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields and try again." };
  // La foto tiene que estar en la carpeta de ESTE comercio (nadie puede apuntar a archivos de otro).
  if (parsed.data.imagePath && !parsed.data.imagePath.startsWith(`${owner.tenantId}/products/`)) return NOT_FOUND;

  const { data, error } = await owner.supabase.from("products").insert(toRow(owner.tenantId, parsed.data)).select("id").single();
  if (error) return saveError(error.code);
  revalidatePath("/catalog");
  return { ok: true, id: data.id };
}

export async function updateProduct(id: unknown, input: unknown): Promise<ActionResult> {
  const owner = await getOwnerContext();
  if (!owner) return NOT_FOUND;
  const parsedId = z.uuid().safeParse(id);
  const parsed = productSchema.safeParse(input);
  if (!parsedId.success) return NOT_FOUND;
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields and try again." };
  if (parsed.data.imagePath && !parsed.data.imagePath.startsWith(`${owner.tenantId}/products/`)) return NOT_FOUND;

  const { tenant_id: _tenant, ...changes } = toRow(owner.tenantId, parsed.data);
  void _tenant; // el comercio nunca cambia en una edición
  const { error } = await owner.supabase.from("products").update(changes).eq("id", parsedId.data).eq("tenant_id", owner.tenantId);
  if (error) return saveError(error.code);
  revalidatePath("/catalog");
  return { ok: true };
}

/** Mostrar u ocultar un producto sin editarlo (p. ej. se agotó). */
export async function setProductAvailability(id: unknown, available: unknown): Promise<ActionResult> {
  const owner = await getOwnerContext();
  if (!owner) return NOT_FOUND;
  const parsedId = z.uuid().safeParse(id);
  const parsedFlag = z.boolean().safeParse(available);
  if (!parsedId.success || !parsedFlag.success) return NOT_FOUND;

  const { error } = await owner.supabase.from("products").update({ is_available: parsedFlag.data }).eq("id", parsedId.data).eq("tenant_id", owner.tenantId);
  if (error) return { ok: false, error: "We couldn't update the product." };
  revalidatePath("/catalog");
  return { ok: true };
}

export async function deleteProduct(id: unknown): Promise<ActionResult> {
  const owner = await getOwnerContext();
  if (!owner) return NOT_FOUND;
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) return NOT_FOUND;

  // Los pedidos ya hechos conservan nombre y precio (snapshot): borrar el producto no los afecta.
  const { error } = await owner.supabase.from("products").delete().eq("id", parsedId.data).eq("tenant_id", owner.tenantId);
  if (error) return { ok: false, error: "We couldn't delete the product." };
  await logAudit({ actorId: owner.userId, action: "PRODUCT_DELETED", resource: "products", tenantId: owner.tenantId, details: { product_id: parsedId.data } });
  revalidatePath("/catalog");
  return { ok: true };
}
