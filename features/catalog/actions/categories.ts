"use server";
/**
 * Server Actions de categorías (solo el dueño). Patrón: 1) comprobar dueño, 2) validar con Zod,
 * 3) escribir con la sesión del usuario (RLS vuelve a exigir "dueño"), 4) refrescar la página.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getOwnerContext } from "@/lib/auth/owner";
import { NOT_FOUND, categorySchema, type ActionResult } from "@/features/catalog/schemas";

export async function createCategory(input: unknown): Promise<ActionResult> {
  const owner = await getOwnerContext();
  if (!owner) return NOT_FOUND;
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the name." };

  const { data, error } = await owner.supabase.from("categories").insert({ tenant_id: owner.tenantId, name: parsed.data.name }).select("id").single();
  if (error) return { ok: false, error: error.code === "23505" ? "You already have a category with that name." : "We couldn't save the category." };
  revalidatePath("/catalog");
  return { ok: true, id: data.id };
}

export async function renameCategory(id: unknown, input: unknown): Promise<ActionResult> {
  const owner = await getOwnerContext();
  if (!owner) return NOT_FOUND;
  const parsedId = z.uuid().safeParse(id);
  const parsed = categorySchema.safeParse(input);
  if (!parsedId.success || !parsed.success) return { ok: false, error: parsed.error?.issues[0]?.message ?? "Check the name." };

  const { error } = await owner.supabase.from("categories").update({ name: parsed.data.name }).eq("id", parsedId.data).eq("tenant_id", owner.tenantId);
  if (error) return { ok: false, error: error.code === "23505" ? "You already have a category with that name." : "We couldn't rename the category." };
  revalidatePath("/catalog");
  return { ok: true };
}

/** Borrar una categoría no borra sus productos: quedan "sin categoría" (lo hace la base). */
export async function deleteCategory(id: unknown): Promise<ActionResult> {
  const owner = await getOwnerContext();
  if (!owner) return NOT_FOUND;
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) return NOT_FOUND;

  const { error } = await owner.supabase.from("categories").delete().eq("id", parsedId.data).eq("tenant_id", owner.tenantId);
  if (error) return { ok: false, error: "We couldn't delete the category." };
  revalidatePath("/catalog");
  return { ok: true };
}
