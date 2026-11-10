/** Pruebas de la validación del menú del bot (límites de WhatsApp). Ejecutar con: npm test */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { menuDisplay, menuSchema } from "./menu";

const item = (over: Record<string, string> = {}) => ({ title: "Pedir", description: "", action: "start_order", categoryId: "", productId: "", ...over });
const CAT = "11111111-1111-4111-8111-111111111111";

describe("bot menu", () => {
  it("accepts a simple menu and trims the texts", () => {
    const parsed = menuSchema.parse({ body: "  Elige:  ", buttonLabel: " Ver ", items: [item({ title: "  Pedir " })] });
    assert.equal(parsed.body, "Elige:");
    assert.equal(parsed.items[0]?.title, "Pedir");
  });
  it("applies WhatsApp limits", () => {
    assert.equal(menuSchema.safeParse({ body: "x", buttonLabel: "x", items: [] }).success, false);
    assert.equal(menuSchema.safeParse({ body: "x", buttonLabel: "x", items: Array.from({ length: 11 }, () => item()) }).success, false);
    assert.equal(menuSchema.safeParse({ body: "x", buttonLabel: "x", items: [item({ title: "x".repeat(25) })] }).success, false);
    assert.equal(menuSchema.safeParse({ body: "x", buttonLabel: "x".repeat(21), items: [item()] }).success, false);
    assert.equal(menuSchema.safeParse({ body: "x", buttonLabel: "x", items: [item({ description: "x".repeat(73) })] }).success, false);
  });
  it("requires a category or product when the action needs it", () => {
    assert.equal(menuSchema.safeParse({ body: "x", buttonLabel: "x", items: [item({ action: "show_category" })] }).success, false);
    assert.equal(menuSchema.safeParse({ body: "x", buttonLabel: "x", items: [item({ action: "show_category", categoryId: CAT })] }).success, true);
    assert.equal(menuSchema.safeParse({ body: "x", buttonLabel: "x", items: [item({ action: "show_product", productId: "nope" })] }).success, false);
    assert.equal(menuSchema.safeParse({ body: "x", buttonLabel: "x", items: [item({ action: "submenu" })] }).success, false);
  });
  it("shows buttons up to 3 options and a list from 4", () => {
    assert.equal(menuDisplay(3), "buttons");
    assert.equal(menuDisplay(4), "list");
  });
});
