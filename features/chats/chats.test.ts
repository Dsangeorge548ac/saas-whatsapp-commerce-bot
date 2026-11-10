/**
 * Pruebas de las reglas del chat con asesor (sin red ni base): cuándo se puede responder y la validación
 * de las entradas. Ejecutar con: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { REPLY_BLOCK_TEXT, canReply } from "./rules";
import { agentMessageSchema, beforeSchema, sessionIdSchema } from "./schemas";

const NOW = new Date("2026-11-10T12:00:00Z");
const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const open = new Date(NOW.getTime() + 3_600_000).toISOString();
const closed = new Date(NOW.getTime() - 60_000).toISOString();

describe("canReply", () => {
  it("allows the assigned agent inside the 24h window", () => {
    assert.deepEqual(canReply({ mode: "human", assignedTo: ME, windowExpiresAt: open }, ME, NOW), { ok: true });
  });
  it("blocks when the conversation is with the bot", () => {
    assert.deepEqual(canReply({ mode: "bot", assignedTo: ME, windowExpiresAt: open }, ME, NOW), { ok: false, reason: "not_human" });
  });
  it("blocks unassigned conversations and ones taken by someone else", () => {
    assert.deepEqual(canReply({ mode: "human", assignedTo: null, windowExpiresAt: open }, ME, NOW), { ok: false, reason: "not_assigned" });
    assert.deepEqual(canReply({ mode: "human", assignedTo: OTHER, windowExpiresAt: open }, ME, NOW), { ok: false, reason: "not_assigned" });
  });
  it("blocks after the WhatsApp 24h window closes (or when there is none)", () => {
    assert.deepEqual(canReply({ mode: "human", assignedTo: ME, windowExpiresAt: closed }, ME, NOW), { ok: false, reason: "window_closed" });
    assert.deepEqual(canReply({ mode: "human", assignedTo: ME, windowExpiresAt: null }, ME, NOW), { ok: false, reason: "window_closed" });
    assert.deepEqual(canReply({ mode: "human", assignedTo: ME, windowExpiresAt: NOW.toISOString() }, ME, NOW), { ok: false, reason: "window_closed" });
  });
  it("explains every block reason in plain language", () => {
    for (const reason of ["not_human", "not_assigned", "window_closed"] as const) assert.ok(REPLY_BLOCK_TEXT[reason].length > 20);
  });
});

describe("chat inputs", () => {
  it("accepts 1–1000 characters of text and trims it", () => {
    assert.equal(agentMessageSchema.parse("  Hola, ya lo revisamos  "), "Hola, ya lo revisamos");
    assert.equal(agentMessageSchema.safeParse("   ").success, false);
    assert.equal(agentMessageSchema.safeParse("x".repeat(1001)).success, false);
    assert.equal(agentMessageSchema.safeParse("x".repeat(1000)).success, true);
  });
  it("requires uuids for the conversation id", () => {
    assert.equal(sessionIdSchema.safeParse(ME).success, true);
    for (const bad of ["1; drop table", "", undefined, "11111111-1111-1111-1111-11111111111"]) assert.equal(sessionIdSchema.safeParse(bad).success, false);
  });
  it("accepts an ISO date as history cursor and ignores anything else", () => {
    assert.equal(beforeSchema.parse("2026-11-10T11:00:00.000Z"), "2026-11-10T11:00:00.000Z");
    assert.equal(beforeSchema.parse("'; drop table messages;--"), undefined);
    assert.equal(beforeSchema.parse("yesterday"), undefined);
    assert.equal(beforeSchema.parse(undefined), undefined);
  });
});
