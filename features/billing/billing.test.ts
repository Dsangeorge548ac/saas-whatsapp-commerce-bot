/** Pruebas de la regla de renovación que se muestra en Billing. Ejecutar con: npm test */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renewalRule } from "./renewal";

describe("renewalRule", () => {
  it("renews monthly on the same day", () => {
    assert.equal(renewalRule("monthly", "2026-11-10T15:00:00Z"), "Renews on the 10th of each month");
    assert.equal(renewalRule("monthly", "2026-11-01T15:00:00Z"), "Renews on the 1st of each month");
    assert.equal(renewalRule("monthly", "2026-11-22T15:00:00Z"), "Renews on the 22nd of each month");
    assert.equal(renewalRule("monthly", "2026-11-13T15:00:00Z"), "Renews on the 13th of each month");
  });
  it("renews yearly on the same date", () => {
    assert.equal(renewalRule("yearly", "2026-11-10T15:00:00Z"), "Renews every year on November 10");
  });
  it("has a safe fallback", () => {
    assert.equal(renewalRule("monthly", null), "Renews on the same day you subscribed");
  });
});
