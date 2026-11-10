/**
 * Pruebas de las validaciones del catálogo y del pedido web (Zod, sin red ni base). Ejecutar con: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { priceTextSchema, productListParamsSchema, productSchema, publicationSchema } from "./schemas";
import { submitOrderSchema } from "../storefront/schemas";

const TENANT = "11111111-1111-4111-8111-111111111111";
const PRODUCT = "22222222-2222-4222-8222-222222222222";
const baseProduct = { name: "Pan", description: null, price: 4.5, priceVisible: true, sku: null, categoryId: null, isAvailable: true, imagePath: null };

describe("price", () => {
  it("accepts up to 9 integer digits and 2 decimals", () => {
    for (const ok of ["0", "4", "4.5", "4.50", "999999999.99"]) assert.equal(priceTextSchema.safeParse(ok).success, true, ok);
  });
  it("rejects negatives, commas, 3 decimals, text and huge numbers", () => {
    for (const bad of ["-1", "4,50", "4.505", "abc", "", "1e3", "1000000000", " "]) assert.equal(priceTextSchema.safeParse(bad).success, false, bad);
  });
});

describe("productSchema (Server Action)", () => {
  it("accepts a valid product and an image path inside the products folder", () => {
    assert.equal(productSchema.safeParse(baseProduct).success, true);
    assert.equal(productSchema.safeParse({ ...baseProduct, imagePath: `${TENANT}/products/${PRODUCT}.webp` }).success, true);
  });
  it("rejects path tricks and other folders in imagePath", () => {
    for (const bad of [`${TENANT}/../x/${PRODUCT}.jpg`, `${TENANT}/branding/${PRODUCT}.jpg`, `${TENANT}/products/${PRODUCT}.svg`, "https://evil.example/x.jpg", `${TENANT}/products/../${PRODUCT}.jpg`]) {
      assert.equal(productSchema.safeParse({ ...baseProduct, imagePath: bad }).success, false, bad);
    }
  });
  it("rejects negative prices, empty names and bad category ids", () => {
    assert.equal(productSchema.safeParse({ ...baseProduct, price: -1 }).success, false);
    assert.equal(productSchema.safeParse({ ...baseProduct, name: "   " }).success, false);
    assert.equal(productSchema.safeParse({ ...baseProduct, categoryId: "not-a-uuid" }).success, false);
  });
});

describe("publicationSchema", () => {
  it("limits a catalog to 60 products and requires uuids", () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    assert.equal(publicationSchema.safeParse({ title: "Hoy", description: null, productIds: ids(60) }).success, true);
    assert.equal(publicationSchema.safeParse({ title: "Hoy", description: null, productIds: ids(61) }).success, false);
    assert.equal(publicationSchema.safeParse({ title: "Hoy", description: null, productIds: ["x"] }).success, false);
    assert.equal(publicationSchema.safeParse({ title: "", description: null, productIds: [] }).success, false);
  });
});

describe("productListParamsSchema", () => {
  it("corrects bad pages and filters instead of failing", () => {
    assert.deepEqual(productListParamsSchema.parse({ page: "abc", q: undefined, category: "zzz" }), { page: 1, q: "", category: undefined });
    assert.equal(productListParamsSchema.parse({ page: "-4" }).page, 1);
    assert.equal(productListParamsSchema.parse({ page: "3", q: "  pan  " }).q, "pan");
    assert.equal(productListParamsSchema.parse({ category: "none" }).category, "none");
    assert.equal(productListParamsSchema.parse({ q: "x".repeat(200) }).q, "");
  });
});

describe("submitOrderSchema (public web order)", () => {
  const token = "a".repeat(64);
  it("accepts a valid order", () => {
    assert.equal(submitOrderSchema.safeParse({ token, items: [{ productId: PRODUCT, quantity: 2 }] }).success, true);
  });
  it("rejects bad tokens, empty orders, zero or huge quantities and fractions", () => {
    assert.equal(submitOrderSchema.safeParse({ token: "short", items: [{ productId: PRODUCT, quantity: 1 }] }).success, false);
    assert.equal(submitOrderSchema.safeParse({ token: "A".repeat(64), items: [{ productId: PRODUCT, quantity: 1 }] }).success, false);
    assert.equal(submitOrderSchema.safeParse({ token, items: [] }).success, false);
    assert.equal(submitOrderSchema.safeParse({ token, items: [{ productId: PRODUCT, quantity: 0 }] }).success, false);
    assert.equal(submitOrderSchema.safeParse({ token, items: [{ productId: PRODUCT, quantity: 1000 }] }).success, false);
    assert.equal(submitOrderSchema.safeParse({ token, items: [{ productId: PRODUCT, quantity: 1.5 }] }).success, false);
    assert.equal(submitOrderSchema.safeParse({ token, items: [{ productId: "x", quantity: 1 }] }).success, false);
  });
  it("does not accept a price from the browser (it would be ignored, and must not be required)", () => {
    const parsed = submitOrderSchema.parse({ token, items: [{ productId: PRODUCT, quantity: 1, price: 0.01 }] });
    assert.deepEqual(Object.keys(parsed.items[0] ?? {}).sort(), ["productId", "quantity"]);
  });
});
