/**
 * /settings/menu — Menú principal del bot (lo que ve el cliente después del saludo). Solo el dueño (el layout de
 * Ajustes ya lo exige; la acción y la base lo vuelven a comprobar). Si el comercio aún no tiene menú, el editor
 * arranca con las opciones sugeridas (pedir, información y asesor) y se crea al guardar.
 */
import { Suspense } from "react";
import type { Metadata } from "next";
import { MenuEditor } from "@/features/settings/components/MenuEditor";
import type { MenuItemInput } from "@/features/settings/menu";
import { currentMembership, requireWorkspace } from "@/lib/data/workspace";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Bot menu" };

const SUGGESTED: { body: string; buttonLabel: string; items: MenuItemInput[] } = {
  body: "Elige una opción para continuar:",
  buttonLabel: "Ver opciones",
  items: [
    { title: "Hacer un pedido", description: "Ver productos y pedir", action: "start_order", categoryId: "", productId: "" },
    { title: "Información", description: "Horario y dirección", action: "business_info", categoryId: "", productId: "" },
    { title: "Hablar con un asesor", description: "", action: "request_agent", categoryId: "", productId: "" },
  ],
};

export default function MenuPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-canvas" aria-busy="true" />}>
      <MenuContent />
    </Suspense>
  );
}

async function MenuContent() {
  const membership = currentMembership(await requireWorkspace());
  if (!membership) return null;
  const supabase = await createClient();
  const tenantId = membership.tenant_id;

  const [{ data: menu }, { data: categories }, { data: products }] = await Promise.all([
    supabase.from("bot_menus").select("id, body, button_label").eq("tenant_id", tenantId).eq("key", "main").maybeSingle(),
    supabase.from("categories").select("id, name").eq("tenant_id", tenantId).order("name").limit(200),
    supabase.from("products").select("id, name").eq("tenant_id", tenantId).order("name").limit(300),
  ]);
  const { data: items } = menu
    ? await supabase.from("bot_menu_items").select("title, description, action, category_id, product_id").eq("menu_id", menu.id).eq("tenant_id", tenantId).order("sort_order")
    : { data: [] };

  // Las opciones de submenú (si existieran de antes) no se editan aquí: se omiten.
  const editable = (items ?? []).filter((item) => item.action !== "submenu");
  const initial = menu
    ? {
        body: menu.body,
        buttonLabel: menu.button_label,
        items: editable.map((item) => ({
          title: item.title,
          description: item.description ?? "",
          action: item.action as MenuItemInput["action"],
          categoryId: item.category_id ?? "",
          productId: item.product_id ?? "",
        })),
      }
    : SUGGESTED;

  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-2xl text-sm text-fg-muted">
        {menu
          ? "This is the menu your bot sends after the welcome message. Change the text, rename the options, reorder them or choose what each one does."
          : "Your bot doesn't have a menu yet. We prepared a suggested one: adjust it and save it."}
      </p>
      <MenuEditor initial={initial} categories={categories ?? []} products={products ?? []} isNew={!menu} />
    </div>
  );
}
