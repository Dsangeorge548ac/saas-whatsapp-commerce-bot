/**
 * Flujo de navegación: menú principal, submenús, productos, información del negocio, asesor humano y
 * enlace personal a la tienda web (donde el cliente arma el pedido).
 *
 * Los menús los configura el dueño (bot_menus / bot_menu_items): hasta 3 ítems se envían como botones y
 * hasta 10 como lista. Los ids de respuesta llevan prefijo: `menu:<id>` (ítem del menú) y `prod:<id>`.
 * El pedido se arma en la tienda web con un enlace de UN solo uso ligado a esta conversación; el bot
 * nunca pide datos personales por la web (la identidad es el teléfono de WhatsApp).
 */
import "server-only";
import { storeUrl } from "@/lib/storefront/url";
import { formatMoney, formatSchedule } from "@/lib/whatsapp/format";
import { loadMessage, say, send, sayText } from "@/features/whatsapp/outbound";
import { requestHandoff, setState } from "@/features/whatsapp/session";
import { TEXT } from "@/features/whatsapp/texts";
import type { Ctx } from "@/features/whatsapp/types";
import type { InboundContent } from "@/lib/whatsapp/payload";
import { renderTemplate } from "@/lib/whatsapp/format";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type MenuRow = { id: string; title: string; body: string; button_label: string };
type ItemRow = { id: string; title: string; description: string | null };

async function sendMenu(ctx: Ctx, menu: MenuRow, items: ItemRow[]): Promise<void> {
  if (items.length === 0) {
    await sayText(ctx, menu.body, "menu");
  } else if (items.length <= 3) {
    await send(ctx, { kind: "buttons", body: menu.body, buttons: items.map((item) => ({ id: `menu:${item.id}`, title: item.title })) }, "menu");
  } else {
    await send(
      ctx,
      {
        kind: "list",
        body: menu.body,
        buttonLabel: menu.button_label,
        rows: items.map((item) => ({ id: `menu:${item.id}`, title: item.title, description: item.description ?? undefined })),
      },
      "menu",
    );
  }
}

async function loadMenu(ctx: Ctx, filter: { key: string } | { id: string }) {
  const query = ctx.admin.from("bot_menus").select("id, title, body, button_label").eq("tenant_id", ctx.tenant.id);
  const { data: menu } = await ("key" in filter ? query.eq("key", filter.key) : query.eq("id", filter.id)).maybeSingle();
  if (!menu) return null;
  const { data: items } = await ctx.admin
    .from("bot_menu_items")
    .select("id, title, description")
    .eq("menu_id", menu.id)
    .eq("tenant_id", ctx.tenant.id)
    .order("sort_order");
  return { menu, items: items ?? [] };
}

/** Saludo (opcional) y menú principal. Deja la conversación en `browsing_menu`. */
export async function showMainMenu(ctx: Ctx, options: { greet: boolean }): Promise<void> {
  if (ctx.session.state !== "browsing_menu") await setState(ctx, "browsing_menu", null);
  if (options.greet) await say(ctx, "welcome");
  const loaded = await loadMenu(ctx, { key: "main" });
  if (loaded) await sendMenu(ctx, loaded.menu, loaded.items);
  else await say(ctx, "menu_prompt");
}

/** Crea el enlace personal de la tienda web y lo envía como botón. */
export async function sendCatalogLink(ctx: Ctx): Promise<void> {
  const { data: publication } = await ctx.admin
    .from("catalog_publications")
    .select("id")
    .eq("tenant_id", ctx.tenant.id)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!publication) return void (await sayText(ctx, TEXT.noCatalog, "no_catalog"));

  const { data: token, error } = await ctx.admin.rpc("create_web_order_link", { p_session: ctx.session.id, p_publication: publication.id });
  if (error || !token) throw new Error("WEB_LINK_FAILED");

  const body = renderTemplate(await loadMessage(ctx, "catalog_prompt"), { business_name: ctx.tenant.businessName });
  await send(
    ctx,
    { kind: "cta_url", body, label: TEXT.openCatalog, url: storeUrl(ctx.tenant.slug, `/c/${publication.id}?t=${token}`) },
    "catalog_link",
  );
  if (ctx.session.state !== "browsing_catalog") await setState(ctx, "browsing_catalog");
}

async function showCategory(ctx: Ctx, categoryId: string): Promise<void> {
  const { data: products } = await ctx.admin
    .from("products")
    .select("id, name, price, price_visible")
    .eq("tenant_id", ctx.tenant.id)
    .eq("category_id", categoryId)
    .eq("is_available", true)
    .order("sort_order")
    .limit(10);
  if (!products?.length) return void (await sayText(ctx, TEXT.noProducts, "no_products"));
  await send(
    ctx,
    {
      kind: "list",
      body: TEXT.pickProduct,
      buttonLabel: TEXT.seeProducts,
      rows: products.map((p) => ({ id: `prod:${p.id}`, title: p.name, description: p.price_visible ? formatMoney(p.price, ctx.tenant.currency) : TEXT.askForQuote })),
    },
    "category",
  );
}

async function showProduct(ctx: Ctx, productId: string): Promise<void> {
  const { data: product } = await ctx.admin
    .from("products")
    .select("name, description, price, price_visible")
    .eq("id", productId)
    .eq("tenant_id", ctx.tenant.id)
    .eq("is_available", true)
    .maybeSingle();
  if (!product) return void (await sayText(ctx, TEXT.noProducts, "no_products"));
  const price = product.price_visible ? formatMoney(product.price, ctx.tenant.currency) : TEXT.askForQuote;
  await sayText(ctx, [`*${product.name}*`, product.description, price].filter(Boolean).join("\n"), "product");
  await sendCatalogLink(ctx);
}

async function showBusinessInfo(ctx: Ctx): Promise<void> {
  const { data: hours } = await ctx.admin.from("tenant_business_hours").select("weekday, is_open, opens_at, closes_at").eq("tenant_id", ctx.tenant.id);
  const schedule = hours?.length ? formatSchedule(hours) : TEXT.alwaysOpen;
  await say(ctx, "business_info", { schedule });
}

async function runMenuAction(ctx: Ctx, itemId: string): Promise<void> {
  if (!UUID.test(itemId)) return showMainMenu(ctx, { greet: false });
  const { data: item } = await ctx.admin
    .from("bot_menu_items")
    .select("action, target_menu_id, category_id, product_id")
    .eq("id", itemId)
    .eq("tenant_id", ctx.tenant.id)
    .maybeSingle();
  if (!item) return showMainMenu(ctx, { greet: false });

  switch (item.action) {
    case "submenu": {
      const loaded = item.target_menu_id ? await loadMenu(ctx, { id: item.target_menu_id }) : null;
      if (loaded) return sendMenu(ctx, loaded.menu, loaded.items);
      return showMainMenu(ctx, { greet: false });
    }
    case "show_category":
      return item.category_id ? showCategory(ctx, item.category_id) : showMainMenu(ctx, { greet: false });
    case "show_product":
      return item.product_id ? showProduct(ctx, item.product_id) : showMainMenu(ctx, { greet: false });
    case "start_order":
      return sendCatalogLink(ctx);
    case "business_info":
      return showBusinessInfo(ctx);
    case "request_agent":
      await requestHandoff(ctx);
      return say(ctx, "handoff_to_agent");
  }
}

/** Mensajes del cliente mientras navega (inicio, menús, categorías, carrito sin confirmar). */
export async function handleBrowsing(ctx: Ctx, content: InboundContent): Promise<void> {
  if (content.type === "reply") {
    if (content.replyId.startsWith("menu:")) return runMenuAction(ctx, content.replyId.slice(5));
    if (content.replyId.startsWith("prod:") && UUID.test(content.replyId.slice(5))) return showProduct(ctx, content.replyId.slice(5));
  }
  // Cualquier otro mensaje: saludo (solo la primera vez de la sesión) y menú principal.
  return showMainMenu(ctx, { greet: ctx.session.state === "idle" });
}
