"use server";
/**
 * Server Actions de publicaciones de catálogo (solo el dueño): crear, editar, publicar/despublicar y borrar.
 * Una publicación es una colección de productos que se muestra como tarjetas en la tienda pública del
 * comercio. La base impone: al menos un producto para publicar, máximo 60 productos, y que cada producto
 * sea del mismo comercio (FK compuesta). Publicar y borrar quedan en la auditoría.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { getOwnerContext, type OwnerContext } from "@/lib/auth/owner";
import { NOT_FOUND, publicationSchema, type ActionResult } from "@/features/catalog/schemas";

/** Deja los productos de la publicación exactamente como se pidió (borra los que sobran, agrega los nuevos). */
async function syncItems(owner: OwnerContext, publicationId: string, productIds: string[]): Promise<boolean> {
  const { data: existing } = await owner.supabase.from("catalog_publication_items").select("product_id").eq("publication_id", publicationId);
  const current = new Set((existing ?? []).map((row) => row.product_id));
  const wanted = new Set(productIds);

  const toRemove = [...current].filter((id) => !wanted.has(id));
  if (toRemove.length) {
    const { error } = await owner.supabase.from("catalog_publication_items").delete().eq("publication_id", publicationId).in("product_id", toRemove);
    if (error) return false;
  }
  const toAdd = productIds.filter((id) => !current.has(id));
  if (toAdd.length) {
    const { error } = await owner.supabase
      .from("catalog_publication_items")
      .insert(toAdd.map((product_id, index) => ({ publication_id: publicationId, product_id, tenant_id: owner.tenantId, sort_order: current.size + index })));
    if (error) return false;
  }
  return true;
}

export async function createPublication(input: unknown): Promise<ActionResult> {
  const owner = await getOwnerContext();
  if (!owner) return NOT_FOUND;
  const parsed = publicationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the highlighted fields." };

  const { data, error } = await owner.supabase
    .from("catalog_publications")
    .insert({ tenant_id: owner.tenantId, title: parsed.data.title, description: parsed.data.description, created_by: owner.userId })
    .select("id")
    .single();
  if (error) return { ok: false, error: "We couldn't create the catalog." };
  if (!(await syncItems(owner, data.id, parsed.data.productIds))) return { ok: false, error: "The catalog was created, but some products couldn't be added." };
  revalidatePath("/catalog");
  return { ok: true, id: data.id };
}

export async function updatePublication(id: unknown, input: unknown): Promise<ActionResult> {
  const owner = await getOwnerContext();
  if (!owner) return NOT_FOUND;
  const parsedId = z.uuid().safeParse(id);
  const parsed = publicationSchema.safeParse(input);
  if (!parsedId.success) return NOT_FOUND;
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the highlighted fields." };

  const { error } = await owner.supabase
    .from("catalog_publications")
    .update({ title: parsed.data.title, description: parsed.data.description })
    .eq("id", parsedId.data)
    .eq("tenant_id", owner.tenantId);
  if (error) return { ok: false, error: "We couldn't save the catalog." };
  if (!(await syncItems(owner, parsedId.data, parsed.data.productIds))) return { ok: false, error: "Some products couldn't be updated." };
  revalidatePath("/catalog");
  return { ok: true };
}

/** Publicar exige al menos un producto (lo valida la base). Despublicar la vuelve borrador. */
export async function setPublicationStatus(id: unknown, status: unknown): Promise<ActionResult> {
  const owner = await getOwnerContext();
  if (!owner) return NOT_FOUND;
  const parsedId = z.uuid().safeParse(id);
  const parsedStatus = z.enum(["draft", "published"]).safeParse(status);
  if (!parsedId.success || !parsedStatus.success) return NOT_FOUND;

  const { error } = await owner.supabase.from("catalog_publications").update({ status: parsedStatus.data }).eq("id", parsedId.data).eq("tenant_id", owner.tenantId);
  if (error) return { ok: false, error: error.message.includes("at least one product") ? "Add at least one product before publishing." : "We couldn't change the status." };
  await logAudit({
    actorId: owner.userId,
    action: parsedStatus.data === "published" ? "PUBLICATION_PUBLISHED" : "PUBLICATION_UNPUBLISHED",
    resource: "catalog_publications",
    tenantId: owner.tenantId,
    details: { publication_id: parsedId.data },
  });
  revalidatePath("/catalog");
  return { ok: true };
}

export async function deletePublication(id: unknown): Promise<ActionResult> {
  const owner = await getOwnerContext();
  if (!owner) return NOT_FOUND;
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) return NOT_FOUND;

  const { error } = await owner.supabase.from("catalog_publications").delete().eq("id", parsedId.data).eq("tenant_id", owner.tenantId);
  if (error) return { ok: false, error: "We couldn't delete the catalog." };
  await logAudit({ actorId: owner.userId, action: "PUBLICATION_DELETED", resource: "catalog_publications", tenantId: owner.tenantId, details: { publication_id: parsedId.data } });
  revalidatePath("/catalog");
  return { ok: true };
}
