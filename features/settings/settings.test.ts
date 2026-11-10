/**
 * Pruebas de las validaciones de Ajustes y de las reglas de los mensajes del bot (sin red ni base).
 * Ejecutar con: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { needsInfo, placeholdersIn, sampleVars, validateMessage } from "./messages";
import { businessFormSchema, businessSchema, hoursSchema, isValidTimeZone, paymentMethodSchema } from "./schemas";

const TENANT = "11111111-1111-4111-8111-111111111111";
const IMG = "22222222-2222-4222-8222-222222222222";

describe("time zones", () => {
  it("accepts IANA names and UTC", () => {
    for (const ok of ["America/Caracas", "Asia/Tokyo", "UTC", "America/Argentina/Buenos_Aires"]) assert.equal(isValidTimeZone(ok), true, ok);
  });
  it("rejects made-up zones and bare words", () => {
    for (const bad of ["Mars/Base", "caracas", "", "GMT+5", "../etc"]) assert.equal(isValidTimeZone(bad), false, bad);
  });
});

describe("business settings", () => {
  const base = {
    name: "Luna Bakery", businessType: "store", currency: "USD", timezone: "America/Caracas",
    acceptsDelivery: true, acceptsPickup: true, deliveryFee: "2.50", requireDeliveryLocation: true, accentColor: "#D4F269",
  };
  it("accepts a valid form and normalizes the color", () => {
    const parsed = businessFormSchema.parse(base);
    assert.equal(parsed.accentColor, "#d4f269");
    assert.equal(businessFormSchema.parse({ ...base, accentColor: "" }).accentColor, null);
  });
  it("needs delivery or pickup", () => {
    assert.equal(businessFormSchema.safeParse({ ...base, acceptsDelivery: false, acceptsPickup: false }).success, false);
    assert.equal(businessFormSchema.safeParse({ ...base, acceptsDelivery: false }).success, true);
  });
  it("rejects bad currency, fee, color and time zone", () => {
    for (const bad of [{ currency: "ZZZ" }, { deliveryFee: "-1" }, { deliveryFee: "2,50" }, { accentColor: "red" }, { timezone: "Mars/Base" }, { name: "x" }]) {
      assert.equal(businessFormSchema.safeParse({ ...base, ...bad }).success, false, JSON.stringify(bad));
    }
  });
  it("only accepts a logo path inside the logo folder (server schema)", () => {
    const server = { name: "Luna", businessType: "store", currency: "USD", timezone: "UTC", acceptsDelivery: true, acceptsPickup: false, deliveryFee: 0, requireDeliveryLocation: false, accentColor: null };
    assert.equal(businessSchema.safeParse({ ...server, logoPath: `${TENANT}/logo/${IMG}.png` }).success, true);
    for (const bad of [`${TENANT}/products/${IMG}.png`, `${TENANT}/logo/../x.png`, "https://evil.example/a.png", `${TENANT}/logo/${IMG}.svg`]) {
      assert.equal(businessSchema.safeParse({ ...server, logoPath: bad }).success, false, bad);
    }
  });
});

describe("business hours", () => {
  const day = (weekday: number, extra = {}) => ({ weekday, isOpen: true, opensAt: "09:00", closesAt: "18:00", ...extra });
  const week = (over: Record<number, object> = {}) => [1, 2, 3, 4, 5, 6, 7].map((weekday) => day(weekday, over[weekday]));
  it("accepts a full week, including an overnight shift", () => {
    assert.equal(hoursSchema.safeParse({ enabled: true, days: week() }).success, true);
    assert.equal(hoursSchema.safeParse({ enabled: true, days: week({ 5: { opensAt: "18:00", closesAt: "02:00" } }) }).success, true);
    assert.equal(hoursSchema.safeParse({ enabled: true, days: week({ 7: { isOpen: false, opensAt: null, closesAt: null } }) }).success, true);
  });
  it("rejects opening = closing, bad times, repeated or missing days", () => {
    assert.equal(hoursSchema.safeParse({ enabled: true, days: week({ 2: { closesAt: "09:00" } }) }).success, false);
    assert.equal(hoursSchema.safeParse({ enabled: true, days: week({ 2: { opensAt: "25:00" } }) }).success, false);
    assert.equal(hoursSchema.safeParse({ enabled: true, days: week({ 7: { weekday: 6 } }) }).success, false);
    assert.equal(hoursSchema.safeParse({ enabled: true, days: week().slice(0, 6) }).success, false);
  });
});

describe("payment methods", () => {
  const base = { type: "pago_movil", label: "Pago Móvil Banesco", currency: "VES", details: { bank_name: "Banesco", phone: "0414-1234567" }, isActive: true };
  it("accepts known fields", () => assert.equal(paymentMethodSchema.safeParse(base).success, true));
  it("rejects unknown fields, long values, non-text values and unknown types", () => {
    assert.equal(paymentMethodSchema.safeParse({ ...base, details: { evil: "x" } }).success, false);
    assert.equal(paymentMethodSchema.safeParse({ ...base, details: { phone: "x".repeat(201) } }).success, false);
    assert.equal(paymentMethodSchema.safeParse({ ...base, details: { phone: 5 } }).success, false);
    assert.equal(paymentMethodSchema.safeParse({ ...base, type: "paypal" }).success, false);
    assert.equal(paymentMethodSchema.safeParse({ ...base, label: "a" }).success, false);
  });
});

describe("bot message rules", () => {
  const allowed = ["order_number", "total", "payment_details"];
  const required = ["total", "payment_details"];
  it("finds placeholders once each", () => assert.deepEqual(placeholdersIn("Hi {a_b} {a_b} {c} {Bad} {1}"), ["a_b", "c"]));
  it("accepts a message that uses allowed placeholders and includes the required ones", () => {
    assert.equal(validateMessage("Order #{order_number}: pay {total} to {payment_details}", allowed, required), null);
  });
  it("rejects unknown placeholders and says what is allowed", () => {
    assert.match(validateMessage("Hi {foo}", allowed, []) ?? "", /\{foo\} can't be used/);
    assert.match(validateMessage("Hi {foo}", [], []) ?? "", /no placeholders/);
  });
  it("rejects a message that drops a required placeholder", () => {
    assert.match(validateMessage("Please pay {total}", allowed, required) ?? "", /must include \{payment_details\}/);
  });
  it("rejects empty and too long text", () => {
    assert.ok(validateMessage("   ", allowed, []));
    assert.ok(validateMessage("x".repeat(1001), allowed, []));
  });
  it("detects parts the owner still has to complete", () => {
    assert.equal(needsInfo("Horario: [escribe tu horario]"), true);
    assert.equal(needsInfo("Horario: lunes a viernes"), false);
  });
  it("gives sample data for every placeholder the defaults can use", () => {
    const vars = sampleVars("Luna");
    for (const name of ["business_name", "customer_name", "order_number", "total", "items", "payment_details", "reason", "schedule", "next_open", "opening_time", "closing_time"]) {
      assert.ok(vars[name], name);
    }
  });
});
