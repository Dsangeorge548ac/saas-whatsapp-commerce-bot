/** Pruebas de las validaciones de avisos (sin red ni base). Ejecutar con: npm test */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listParamsSchema, notificationIdSchema, safeLink } from "./schemas";

describe("safeLink", () => {
  it("keeps internal routes", () => {
    assert.equal(safeLink("/orders"), "/orders");
    assert.equal(safeLink("/settings/whatsapp"), "/settings/whatsapp");
  });
  it("drops external, protocol-relative and malformed links", () => {
    for (const bad of ["https://evil.test", "//evil.test", "/\\evil.test", "javascript:alert(1)", "orders", "/a\nb", "", null]) assert.equal(safeLink(bad), null);
  });
});

describe("list params", () => {
  it("falls back to defaults on garbage", () => {
    assert.deepEqual(listParamsSchema.parse({ page: "-4", filter: "x" }), { page: 1, filter: "all" });
    assert.deepEqual(listParamsSchema.parse({}), { page: 1, filter: "all" });
  });
  it("accepts a valid page and filter", () => {
    assert.deepEqual(listParamsSchema.parse({ page: "3", filter: "unread" }), { page: 3, filter: "unread" });
  });
  it("requires a uuid id", () => {
    assert.equal(notificationIdSchema.safeParse("1; drop table").success, false);
    assert.equal(notificationIdSchema.safeParse("11111111-1111-4111-8111-111111111111").success, true);
  });
});
