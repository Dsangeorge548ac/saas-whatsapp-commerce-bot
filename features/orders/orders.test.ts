/**
 * Pruebas de las piezas puras del módulo de pedidos: tiempo transcurrido, validaciones y estados.
 * Ejecutar con: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { timeAgo } from "../../lib/time-ago";
import { advanceTargetSchema, historyParamsSchema, orderIdSchema, reasonSchema } from "./schemas";
import { BOARD_COLUMNS, CANCELLABLE, STATUS_LABEL } from "./status";

const NOW = new Date("2026-11-10T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe("timeAgo", () => {
  it("describes recent, minute, hour and day ranges", () => {
    assert.equal(timeAgo(ago(20_000), NOW), "just now");
    assert.equal(timeAgo(ago(5 * 60_000), NOW), "5 min ago");
    assert.equal(timeAgo(ago(3 * 3_600_000 + 100), NOW), "3 h ago");
    assert.equal(timeAgo(ago(25 * 3_600_000), NOW), "1 day ago");
    assert.equal(timeAgo(ago(4 * 86_400_000), NOW), "4 days ago");
  });
  it("never shows the future as negative time", () => {
    assert.equal(timeAgo(new Date(NOW.getTime() + 60_000), NOW), "just now");
  });
  it("accepts ISO strings", () => assert.equal(timeAgo("2026-11-10T11:55:00Z", NOW), "5 min ago"));
});

describe("order action inputs", () => {
  it("only lets operators move manually to on_the_way or delivered", () => {
    assert.equal(advanceTargetSchema.safeParse("on_the_way").success, true);
    assert.equal(advanceTargetSchema.safeParse("delivered").success, true);
    for (const bad of ["approved", "pending", "cancelled", "awaiting_payment", "", "DELIVERED"]) assert.equal(advanceTargetSchema.safeParse(bad).success, false, bad);
  });
  it("requires a real reason between 3 and 300 characters", () => {
    assert.equal(reasonSchema.safeParse("No stock").success, true);
    assert.equal(reasonSchema.safeParse("  ab  ").success, false);
    assert.equal(reasonSchema.safeParse("x".repeat(301)).success, false);
    assert.equal(reasonSchema.safeParse("  Proof is blurry  ").data, "Proof is blurry");
  });
  it("requires uuids", () => {
    assert.equal(orderIdSchema.safeParse("22222222-2222-4222-8222-222222222222").success, true);
    assert.equal(orderIdSchema.safeParse("1; drop table orders").success, false);
    assert.equal(orderIdSchema.safeParse(undefined).success, false);
  });
  it("corrects bad history filters instead of failing", () => {
    assert.deepEqual(historyParamsSchema.parse({ page: "zzz", status: "approved" }), { page: 1, status: "delivered" });
    assert.deepEqual(historyParamsSchema.parse({ page: "3", status: "cancelled" }), { page: 3, status: "cancelled" });
  });
});

describe("board configuration", () => {
  it("has the four board columns in order, without the unpaid tray", () => {
    assert.deepEqual(BOARD_COLUMNS.map((column) => column.status), ["pending", "approved", "on_the_way", "delivered"]);
  });
  it("allows cancelling only before the order leaves for delivery", () => {
    assert.deepEqual([...CANCELLABLE].sort(), ["approved", "awaiting_payment", "pending"]);
  });
  it("labels every status", () => {
    assert.equal(Object.keys(STATUS_LABEL).length, 6);
  });
});
