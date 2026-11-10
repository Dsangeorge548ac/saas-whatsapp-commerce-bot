/** Pruebas de las validaciones de usuarios (admin) y del perfil (sin red ni base). Ejecutar con: npm test */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { activityLabel, relativeTime } from "./activity";
import { avatarUrl, isOwnAvatarPath } from "../../lib/files/avatar";
import { monthlyRecurringCents } from "../../lib/stripe/plans";
import { adminAccountSchema, assignPlanSchema, subscriptionView, adminNameSchema, platformRoleSchema, userIdSchema, userListParamsSchema } from "./schemas";
import { changeEmailSchema, changePasswordFormSchema, changePasswordSchema, profileNameSchema } from "../profile/schemas";

describe("user list params", () => {
  it("falls back to safe defaults on garbage", () => {
    assert.deepEqual(userListParamsSchema.parse({ q: "x".repeat(200), filter: "root", page: "-1" }), { q: "", filter: "all", page: 1 });
    assert.deepEqual(userListParamsSchema.parse({}), { q: "", filter: "all", page: 1 });
  });
  it("accepts valid values and trims the search", () => {
    assert.deepEqual(userListParamsSchema.parse({ q: "  ana ", filter: "owners", page: "4" }), { q: "ana", filter: "owners", page: 4 });
  });
});

describe("admin inputs", () => {
  it("requires uuids and a known role", () => {
    assert.equal(userIdSchema.safeParse("1; drop table").success, false);
    assert.equal(userIdSchema.safeParse("11111111-1111-4111-8111-111111111111").success, true);
    assert.equal(platformRoleSchema.safeParse("superuser").success, false);
    for (const ok of ["developer", "platform_admin", "none"]) assert.equal(platformRoleSchema.safeParse(ok).success, true);
  });
  it("validates names like the database does (1–80 characters)", () => {
    assert.equal(adminNameSchema.safeParse({ firstName: "Ana", lastName: "Pérez" }).success, true);
    assert.equal(adminNameSchema.safeParse({ firstName: " ", lastName: "x" }).success, false);
    assert.equal(adminNameSchema.safeParse({ firstName: "x".repeat(81), lastName: "x" }).success, false);
  });
});

describe("profile inputs", () => {
  it("trims names", () => {
    assert.deepEqual(profileNameSchema.parse({ firstName: " Ana ", lastName: " Pérez " }), { firstName: "Ana", lastName: "Pérez" });
  });
  it("requires 12+ characters, a matching confirmation and a different password", () => {
    const base = { currentPassword: "old-password-123", newPassword: "new-password-456", confirmPassword: "new-password-456" };
    assert.equal(changePasswordFormSchema.safeParse(base).success, true);
    assert.equal(changePasswordFormSchema.safeParse({ ...base, newPassword: "short", confirmPassword: "short" }).success, false);
    assert.equal(changePasswordFormSchema.safeParse({ ...base, confirmPassword: "different-12345" }).success, false);
    assert.equal(changePasswordFormSchema.safeParse({ ...base, newPassword: base.currentPassword, confirmPassword: base.currentPassword }).success, false);
    assert.equal(changePasswordSchema.safeParse({ currentPassword: "x", newPassword: "short" }).success, false);
  });
  it("normalizes the new email", () => {
    assert.equal(changeEmailSchema.parse({ newEmail: "  Ana@Example.COM ", currentPassword: "x" }).newEmail, "ana@example.com");
    assert.equal(changeEmailSchema.safeParse({ newEmail: "nope", currentPassword: "x" }).success, false);
  });
});

describe("activity helpers", () => {
  it("labels known actions and humanizes unknown ones", () => {
    assert.equal(activityLabel("LOGIN_SUCCESS"), "Logged in");
    assert.equal(activityLabel("PAYMENT_METHOD_CREATED"), "Payment method created");
  });
  it("formats relative time against a fixed clock", () => {
    const now = new Date("2026-11-10T12:00:00Z");
    assert.equal(relativeTime("2026-11-10T11:59:30Z", now), "just now");
    assert.equal(relativeTime("2026-11-10T11:55:00Z", now), "5 min ago");
    assert.equal(relativeTime("2026-11-10T09:00:00Z", now), "3 h ago");
    assert.equal(relativeTime("2026-11-09T12:00:00Z", now), "1 day ago");
    assert.equal(relativeTime("2026-09-01T12:00:00Z", now), "Sep 1, 2026");
  });
});

describe("subscriptions (admin)", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  it("shows one visible state per subscription", () => {
    assert.equal(subscriptionView("active", false, null, now), "active");
    assert.equal(subscriptionView("active", true, null, now), "canceling");
    assert.equal(subscriptionView("past_due", false, null, now), "issue");
    assert.equal(subscriptionView("canceled", false, null, now), "ended");
    assert.equal(subscriptionView("incomplete", false, "2026-12-01T00:00:00Z", now), "complimentary");
    assert.equal(subscriptionView("incomplete", false, "2026-11-01T00:00:00Z", now), "other");
    assert.equal(subscriptionView("active", false, "2026-12-01T00:00:00Z", now), "active"); // la suscripción pagada manda
  });
  it("counts yearly plans per month in the MRR", () => {
    assert.equal(monthlyRecurringCents([{ plan_id: "pro", interval: "monthly", count: 2 }]), 9800);
    assert.equal(monthlyRecurringCents([{ plan_id: "pro", interval: "yearly", count: 1 }]), Math.round(48800 / 12));
    assert.equal(monthlyRecurringCents([{ plan_id: "gold", interval: "monthly", count: 5 }]), 0);
  });
  it("validates assigned plans and account edits", () => {
    assert.equal(assignPlanSchema.safeParse({ plan: "business", until: "2026-12-31" }).success, true);
    assert.equal(assignPlanSchema.safeParse({ plan: "gold", until: "2026-12-31" }).success, false);
    assert.equal(assignPlanSchema.safeParse({ plan: "pro", until: "next week" }).success, false);
    assert.equal(adminAccountSchema.parse({ firstName: "Ana", lastName: "Sol", email: " ANA@Example.com ", emailConfirmed: true }).email, "ana@example.com");
    assert.equal(adminAccountSchema.safeParse({ firstName: "Ana", lastName: "Sol", email: "nope", emailConfirmed: true }).success, false);
  });
});

describe("profile photo paths", () => {
  const ME = "11111111-1111-4111-8111-111111111111";
  const OTHER = "22222222-2222-4222-8222-222222222222";
  const FILE = "33333333-3333-4333-8333-333333333333";
  it("accepts only a photo inside the user's own folder", () => {
    assert.equal(isOwnAvatarPath(`${ME}/avatar-${FILE}.webp`, ME), true);
    assert.equal(isOwnAvatarPath(`${OTHER}/avatar-${FILE}.webp`, ME), false);
    assert.equal(isOwnAvatarPath(`${ME}/../${OTHER}/avatar-${FILE}.webp`, ME), false);
    assert.equal(isOwnAvatarPath(`${ME}/avatar-${FILE}.svg`, ME), false);
  });
  it("builds a cache-busting URL served by our authorized route", () => {
    assert.equal(avatarUrl(ME, `${ME}/avatar-${FILE}.webp`), `/api/files/avatar/${ME}?v=33333333`);
    assert.equal(avatarUrl(ME, null), null);
  });
});
