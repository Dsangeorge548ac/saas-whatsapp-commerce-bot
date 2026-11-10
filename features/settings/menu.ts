/**
 * Menú principal del bot: tipos, acciones disponibles y validación (Zod) con los límites de WhatsApp.
 * Lo usan el editor (errores al momento) y la Server Action (la validación que protege); la base de datos
 * (save_main_menu) vuelve a validar todo, incluido que la categoría o el producto sean del comercio.
 */
import { z } from "zod";

export const MENU_ACTIONS = [
  { value: "start_order", label: "Order from the catalog", hint: "Sends the customer their personal catalog link." },
  { value: "show_category", label: "Show a category", hint: "Lists the products of one category." },
  { value: "show_product", label: "Show a product", hint: "Shows one product and the catalog link." },
  { value: "business_info", label: "Business information", hint: "Sends your hours and the “Business info” message." },
  { value: "request_agent", label: "Talk to an agent", hint: "Hands the chat to your team in Chats." },
] as const;

export type MenuAction = (typeof MENU_ACTIONS)[number]["value"];

export const MAX_MENU_ITEMS = 10;

export const menuItemSchema = z
  .object({
    title: z.string().trim().min(1, "Write the option name.").max(24, "Use 24 characters or fewer (WhatsApp limit)."),
    description: z.string().trim().max(72, "Use 72 characters or fewer."),
    action: z.enum(["start_order", "show_category", "show_product", "business_info", "request_agent"]),
    categoryId: z.string(),
    productId: z.string(),
  })
  .refine((item) => item.action !== "show_category" || z.uuid().safeParse(item.categoryId).success, { path: ["categoryId"], message: "Choose a category." })
  .refine((item) => item.action !== "show_product" || z.uuid().safeParse(item.productId).success, { path: ["productId"], message: "Choose a product." });

export const menuSchema = z.object({
  body: z.string().trim().min(1, "Write the menu text.").max(1024, "Use 1024 characters or fewer."),
  buttonLabel: z.string().trim().min(1, "Write the button text.").max(20, "Use 20 characters or fewer (WhatsApp limit)."),
  items: z.array(menuItemSchema).min(1, "Add at least one option.").max(MAX_MENU_ITEMS, `Use ${MAX_MENU_ITEMS} options or fewer.`),
});

export type MenuInput = z.infer<typeof menuSchema>;
export type MenuItemInput = z.infer<typeof menuItemSchema>;

/** Cómo lo verá el cliente: hasta 3 opciones como botones; de 4 a 10, como lista con un botón para abrirla. */
export function menuDisplay(count: number): "buttons" | "list" {
  return count <= 3 ? "buttons" : "list";
}
