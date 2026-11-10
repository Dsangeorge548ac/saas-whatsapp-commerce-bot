/**
 * Pruebas de las piezas puras de la suscripción: planes y traducción de estados de Stripe.
 * Ejecutar con: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapInvoiceStatus, mapSubscriptionStatus, nextPastDueSince, unixToIso } from "./mapping";
import { INTERVAL_BY_LOOKUP_KEY, PLANS, PLAN_BY_LOOKUP_KEY, formatPlanPrice, isBillingInterval, isPlanId, yearlyCents } from "./plans";

describe("plans", () => {
  it("has unique ids and lookup keys, and every key is namespaced", () => {
    assert.equal(new Set(PLANS.map((plan) => plan.id)).size, PLANS.length);
    const keys = PLANS.flatMap((plan) => [plan.prices.monthly.lookupKey, plan.prices.yearly.lookupKey]);
    assert.equal(new Set(keys).size, PLANS.length * 2);
    for (const plan of PLANS) {
      assert.match(plan.prices.monthly.lookupKey, /^wabot_[a-z]+_monthly$/);
      assert.match(plan.prices.yearly.lookupKey, /^wabot_[a-z]+_yearly$/);
    }
  });
  it("orders plans by price and keeps limits growing (null = unlimited is the top plan)", () => {
    const prices = PLANS.map((plan) => plan.prices.monthly.amountCents);
    assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
    assert.equal(PLANS[PLANS.length - 1]?.maxOrdersPerMonth, null);
    assert.equal(PLANS[PLANS.length - 1]?.maxUsers, null);
  });
  it("finds plans by lookup key and validates ids", () => {
    assert.equal(PLAN_BY_LOOKUP_KEY.get("wabot_pro_monthly")?.id, "pro");
    assert.equal(PLAN_BY_LOOKUP_KEY.get("wabot_pro_yearly")?.id, "pro");
    assert.equal(INTERVAL_BY_LOOKUP_KEY.get("wabot_pro_yearly"), "yearly");
    assert.equal(isBillingInterval("yearly"), true);
    for (const bad of ["weekly", "", null, "YEARLY"]) assert.equal(isBillingInterval(bad), false);
    assert.equal(PLAN_BY_LOOKUP_KEY.get("taxpro_essential_monthly"), undefined); // la cuenta de Stripe se comparte con otro proyecto
    assert.equal(isPlanId("pro"), true);
    for (const bad of ["enterprise", "", null, 3, "PRO"]) assert.equal(isPlanId(bad), false);
  });
  it("charges yearly plans 17% less than 12 months, in whole dollars", () => {
    assert.equal(yearlyCents(1900), 18900);
    assert.equal(yearlyCents(4900), 48800);
    assert.equal(yearlyCents(9900), 98600);
    for (const plan of PLANS) {
      const saving = 1 - plan.prices.yearly.amountCents / (plan.prices.monthly.amountCents * 12);
      assert.ok(Math.abs(saving - 0.17) < 0.005, `${plan.id} saves ${saving}`);
      assert.equal(plan.prices.yearly.amountCents % 100, 0);
    }
  });
  it("formats prices", () => {
    assert.equal(formatPlanPrice(1900), "$19");
    assert.equal(formatPlanPrice(4950), "$49.50");
  });
});

describe("subscription status mapping", () => {
  it("accepts every Stripe status", () => {
    for (const status of ["incomplete", "incomplete_expired", "trialing", "active", "past_due", "canceled", "unpaid", "paused"]) {
      assert.equal(mapSubscriptionStatus(status), status);
    }
  });
  it("treats unknown statuses as incomplete (no access)", () => {
    assert.equal(mapSubscriptionStatus("something_new"), "incomplete");
    assert.equal(mapSubscriptionStatus(""), "incomplete");
  });
});

describe("grace period start", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  it("starts when the subscription becomes past_due", () => assert.equal(nextPastDueSince("past_due", null, now), "2026-11-10T12:00:00.000Z"));
  it("does not move while it stays past_due (retries must not extend the grace)", () => {
    assert.equal(nextPastDueSince("past_due", "2026-11-05T00:00:00.000Z", now), "2026-11-05T00:00:00.000Z");
  });
  it("clears in any other status", () => {
    for (const status of ["active", "canceled", "unpaid", "trialing"] as const) assert.equal(nextPastDueSince(status, "2026-11-05T00:00:00.000Z", now), null);
  });
});

describe("invoice status mapping and dates", () => {
  it("maps invoice statuses", () => {
    assert.equal(mapInvoiceStatus("paid"), "paid");
    assert.equal(mapInvoiceStatus("paid", 500), "refunded");
    assert.equal(mapInvoiceStatus("open"), "failed");
    assert.equal(mapInvoiceStatus("uncollectible"), "failed");
    assert.equal(mapInvoiceStatus("draft"), "pending");
    assert.equal(mapInvoiceStatus(null), "pending");
  });
  it("converts unix seconds to ISO and tolerates missing values", () => {
    assert.equal(unixToIso(1_700_000_000), "2023-11-14T22:13:20.000Z");
    assert.equal(unixToIso(null), null);
    assert.equal(unixToIso(undefined), null);
  });
});
