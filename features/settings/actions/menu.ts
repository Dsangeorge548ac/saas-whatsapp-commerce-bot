"use server";
/**
 * Server Action del menú principal del bot (solo el dueño): valida con Zod y guarda TODO de una vez con
 * save_main_menu, que vuelve a validar en la base (dueño, límites de WhatsApp, categoría y producto propios) y
 * reemplaza las opciones en una sola transacción (nunca queda un menú a medias).
 */
import { revalidatePath } from "next/cache";
import { getOwnerContext } from "@/lib/auth/owner";
import { menuSchema } from "@/features/settings/menu";
import { NOT_FOUND, type ActionResult } from "@/features/settings/schemas";

function friendly(message: string): string {
  if (message.includes("INVALID_CATEGORY")) return "One of the categories no longer exists. Choose it again.";
  if (message.includes("INVALID_PRODUCT")) return "One of the products no longer exists. Choose it again.";
  if (message.includes("INVALID_ITEMS")) return "Use between 1 and 10 options.";
  return "We couldn't save the menu. Check the fields and try again.";
}

export async function saveMenu(input: unknown): Promise<ActionResult> {
  const owner = await getOwnerContext();
  if (!owner) return NOT_FOUND;
  const parsed = menuSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the menu." };

  const items = parsed.data.items.map((item) => ({
    title: item.title,
    description: item.description,
    action: item.action,
    ...(item.action === "show_category" ? { category_id: item.categoryId } : {}),
    ...(item.action === "show_product" ? { product_id: item.productId } : {}),
  }));
  const { error } = await owner.supabase.rpc("save_main_menu", {
    p_tenant: owner.tenantId,
    p_body: parsed.data.body,
    p_button_label: parsed.data.buttonLabel,
    p_items: items,
  });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath("/settings", "layout");
  return { ok: true, message: "Menu saved" };
}
