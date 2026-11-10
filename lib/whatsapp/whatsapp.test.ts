/**
 * Pruebas de las piezas puras del webhook de WhatsApp (sin red ni base de datos):
 * firma, payload de Meta, mensajes salientes y formato de textos.
 * Ejecutar con: npm test
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { eventKey, extractEvents, toE164, webhookPayloadSchema } from "./payload";
import { buildPayload } from "./outbound-payload";
import { formatMoney, formatNextOpen, formatPaymentDetails, formatSchedule, renderTemplate } from "./format";
import { safeEqual, verifySignature } from "./signature";

const SECRET = "app-secret-for-tests";
const sign = (body: string, secret = SECRET) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

function payloadWith(value: object) {
  return webhookPayloadSchema.parse({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value }] }] });
}
const meta = { phone_number_id: "PN1" };

describe("verifySignature", () => {
  const body = '{"object":"whatsapp_business_account"}';
  it("accepts a valid signature", () => assert.equal(verifySignature(body, sign(body), SECRET), true));
  it("accepts a Buffer body (the raw bytes)", () => assert.equal(verifySignature(Buffer.from(body), sign(body), SECRET), true));
  it("rejects a tampered body", () => assert.equal(verifySignature(body + " ", sign(body), SECRET), false));
  it("rejects another secret", () => assert.equal(verifySignature(body, sign(body, "other-secret-xx"), SECRET), false));
  it("rejects a missing header", () => assert.equal(verifySignature(body, null, SECRET), false));
  it("rejects a header without the sha256= prefix", () => assert.equal(verifySignature(body, sign(body).slice(7), SECRET), false));
  it("rejects non-hex and short signatures without throwing", () => {
    assert.equal(verifySignature(body, "sha256=zzzz", SECRET), false);
    assert.equal(verifySignature(body, "sha256=", SECRET), false);
    assert.equal(verifySignature(body, "sha256=abcd", SECRET), false);
  });
  it("safeEqual compares texts in constant time", () => {
    assert.equal(safeEqual("token-123", "token-123"), true);
    assert.equal(safeEqual("token-123", "token-124"), false);
    assert.equal(safeEqual("a", "abc"), false);
  });
});

describe("toE164", () => {
  it("adds the plus sign", () => assert.equal(toE164("584141234567"), "+584141234567"));
  it("rejects garbage and too short numbers", () => {
    assert.equal(toE164("abc"), null);
    assert.equal(toE164("123"), null);
    assert.equal(toE164("0584141234567"), null);
  });
});

describe("extractEvents", () => {
  it("normalizes text messages and the contact name", () => {
    const events = extractEvents(
      payloadWith({
        metadata: meta,
        contacts: [{ wa_id: "584141234567", profile: { name: "Ana" } }],
        messages: [{ id: "wamid.1", from: "584141234567", type: "text", text: { body: "Hola" } }],
      }),
    );
    assert.deepEqual(events, [
      { kind: "message", phoneNumberId: "PN1", wamid: "wamid.1", from: "+584141234567", profileName: "Ana", content: { type: "text", body: "Hola" } },
    ]);
  });

  it("normalizes button and list replies", () => {
    const events = extractEvents(
      payloadWith({
        metadata: meta,
        messages: [
          { id: "w1", from: "584141234567", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "cart:confirm", title: "Confirm" } } },
          { id: "w2", from: "584141234567", type: "interactive", interactive: { type: "list_reply", list_reply: { id: "menu:abc", title: "Order" } } },
        ],
      }),
    );
    assert.deepEqual(events.map((e) => e.kind === "message" && e.content), [
      { type: "reply", replyId: "cart:confirm", title: "Confirm" },
      { type: "reply", replyId: "menu:abc", title: "Order" },
    ]);
  });

  it("normalizes a shared location and rejects out-of-range coordinates", () => {
    const events = extractEvents(
      payloadWith({
        metadata: meta,
        messages: [
          { id: "w1", from: "584141234567", type: "location", location: { latitude: 10.49, longitude: -66.9 } },
          { id: "w2", from: "584141234567", type: "location", location: { latitude: 95, longitude: 10 } },
        ],
      }),
    );
    assert.deepEqual(events.map((e) => e.kind === "message" && e.content), [{ type: "location", lat: 10.49, lng: -66.9 }, { type: "other", rawType: "location" }]);
  });

  it("normalizes image and document proofs", () => {
    const events = extractEvents(
      payloadWith({
        metadata: meta,
        messages: [
          { id: "w1", from: "584141234567", type: "image", image: { id: "m1", mime_type: "image/jpeg", caption: "REF 123" } },
          { id: "w2", from: "584141234567", type: "document", document: { id: "m2", mime_type: "application/pdf" } },
        ],
      }),
    );
    assert.deepEqual(events.map((e) => e.kind === "message" && e.content), [
      { type: "media", mediaKind: "image", mediaId: "m1", mimeType: "image/jpeg", caption: "REF 123" },
      { type: "media", mediaKind: "document", mediaId: "m2", mimeType: "application/pdf", caption: null },
    ]);
  });

  it("extracts delivery statuses with their error code", () => {
    const events = extractEvents(payloadWith({ metadata: meta, statuses: [{ id: "w9", status: "failed", errors: [{ code: 131047 }] }, { id: "w9", status: "read" }] }));
    assert.deepEqual(events, [
      { kind: "status", phoneNumberId: "PN1", wamid: "w9", status: "failed", errorCode: 131047 },
      { kind: "status", phoneNumberId: "PN1", wamid: "w9", status: "read", errorCode: null },
    ]);
  });

  it("drops messages with an invalid phone number and ignores other fields", () => {
    const valid = payloadWith({ metadata: meta, messages: [{ id: "w1", from: "12", type: "text", text: { body: "x" } }] });
    assert.deepEqual(extractEvents(valid), []);
    const other = webhookPayloadSchema.parse({ object: "x", entry: [{ changes: [{ field: "account_update", value: { metadata: meta } }] }] });
    assert.deepEqual(extractEvents(other), []);
  });

  it("rejects payloads without the expected shape", () => {
    assert.equal(webhookPayloadSchema.safeParse({ hello: "world" }).success, false);
  });

  it("builds idempotency keys: wamid for messages, wamid:status for statuses", () => {
    assert.equal(eventKey({ kind: "message", phoneNumberId: "p", wamid: "w1", from: "+1", profileName: null, content: { type: "text", body: "" } }), "w1");
    assert.equal(eventKey({ kind: "status", phoneNumberId: "p", wamid: "w1", status: "read", errorCode: null }), "w1:read");
  });
});

describe("buildPayload", () => {
  it("builds text messages without the plus sign and with a 4096 limit", () => {
    const payload = buildPayload("+584141234567", { kind: "text", body: "x".repeat(5000) });
    assert.equal(payload.to, "584141234567");
    assert.equal(payload.type, "text");
    assert.equal((payload as { text: { body: string } }).text.body.length, 4096);
  });

  it("limits buttons to 3 and 20 characters", () => {
    const payload = buildPayload("+584141234567", {
      kind: "buttons",
      body: "Choose",
      buttons: [1, 2, 3, 4].map((n) => ({ id: `b${n}`, title: "A very long button title" })),
    });
    const buttons = (payload as { interactive: { action: { buttons: { reply: { title: string } }[] } } }).interactive.action.buttons;
    assert.equal(buttons.length, 3);
    assert.ok(buttons.every((b) => b.reply.title.length <= 20));
  });

  it("limits lists to 10 rows with 24-char titles and 72-char descriptions", () => {
    const rows = Array.from({ length: 12 }, (_, n) => ({ id: `r${n}`, title: "T".repeat(40), description: "D".repeat(100) }));
    const payload = buildPayload("+584141234567", { kind: "list", body: "Pick", buttonLabel: "See options please now", rows });
    const action = (payload as { interactive: { action: { button: string; sections: { rows: { title: string; description: string }[] }[] } } }).interactive.action;
    assert.equal(action.sections[0]?.rows.length, 10);
    assert.ok(action.sections[0]?.rows.every((r) => r.title.length <= 24 && r.description.length <= 72));
    assert.ok(action.button.length <= 20);
  });

  it("builds the location request and the URL button", () => {
    const location = buildPayload("+584141234567", { kind: "location_request", body: "Share it" }) as { interactive: { type: string; action: { name: string } } };
    assert.equal(location.interactive.type, "location_request_message");
    assert.equal(location.interactive.action.name, "send_location");
    const cta = buildPayload("+584141234567", { kind: "cta_url", body: "Catalog", label: "Open catalog", url: "https://shop.example.com/c/1?t=abc" }) as {
      interactive: { type: string; action: { parameters: { url: string } } };
    };
    assert.equal(cta.interactive.type, "cta_url");
    assert.equal(cta.interactive.action.parameters.url, "https://shop.example.com/c/1?t=abc");
  });
});

describe("format", () => {
  it("renders placeholders and drops unknown ones", () => {
    assert.equal(renderTemplate("Hola {customer_name}, bienvenido a {business_name}.{missing}", { customer_name: "Ana", business_name: "Luna" }), "Hola Ana, bienvenido a Luna.");
  });
  it("does not evaluate anything inside values", () => {
    assert.equal(renderTemplate("Hi {customer_name}", { customer_name: "{business_name}${1+1}" }), "Hi {business_name}${1+1}");
  });
  it("formats money", () => {
    assert.equal(formatMoney(8, "USD"), "$8.00");
    assert.equal(formatMoney(12.5, "VES"), "12.50 VES");
  });
  it("formats payment details from the order snapshot", () => {
    assert.equal(
      formatPaymentDetails({ label: "Pago Móvil", currency: "VES", details: { bank_name: "Banesco", phone: "0414-1234567", empty: "", nested: { a: 1 } } }),
      "*Pago Móvil*\nBank name: Banesco\nPhone: 0414-1234567",
    );
    assert.equal(formatPaymentDetails(null), "");
  });
  it("groups consecutive days with the same hours", () => {
    const rows = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, is_open: true, opens_at: "09:00:00", closes_at: "18:00:00" }));
    rows.push({ weekday: 6, is_open: true, opens_at: "09:00:00", closes_at: "13:00:00" }, { weekday: 7, is_open: false, opens_at: null, closes_at: null } as never);
    assert.equal(formatSchedule(rows), "Lun–Vie 09:00–18:00 · Sáb 09:00–13:00 · Dom cerrado");
    const all = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, is_open: true, opens_at: "08:00:00", closes_at: "20:00:00" }));
    assert.equal(formatSchedule(all), "Lun–Dom 08:00–20:00");
  });
  it("describes the next opening relative to the local date", () => {
    const now = new Date("2026-11-09T22:00:00-04:00"); // lunes 22:00 en Caracas
    const status = { is_open: false, next_open_local: "2026-11-10T09:00", next_open_weekday: 2, next_opens_at: "09:00" };
    assert.equal(formatNextOpen(status, now, "America/Caracas"), "mañana a las 09:00");
    assert.equal(formatNextOpen({ ...status, next_open_local: "2026-11-09T23:30", next_opens_at: "23:30" }, now, "America/Caracas"), "hoy a las 23:30");
    assert.equal(formatNextOpen({ ...status, next_open_local: "2026-11-16T09:00", next_open_weekday: 1 }, now, "America/Caracas"), "el lunes a las 09:00");
    assert.equal(formatNextOpen({ is_open: false }, now, "America/Caracas"), "");
  });
  it("uses the shop's time zone, not the server's, to decide what 'today' is", () => {
    const now = new Date("2026-11-10T02:00:00Z"); // en Caracas aún es lunes 9 por la noche; en Tokio ya es martes 10
    const status = { is_open: false, next_open_local: "2026-11-10T09:00", next_open_weekday: 2, next_opens_at: "09:00" };
    assert.equal(formatNextOpen(status, now, "America/Caracas"), "mañana a las 09:00");
    assert.equal(formatNextOpen(status, now, "Asia/Tokyo"), "hoy a las 09:00");
  });
});
