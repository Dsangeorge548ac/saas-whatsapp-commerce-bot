/**
 * Pruebas del ruteo por subdominio y del color de la marca (funciones puras). Ejecutar con: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readableTextColor, safeBrandColor } from "./color";
import { storeSlugFromHost } from "./host";

describe("storeSlugFromHost", () => {
  it("extracts the slug in production and local development", () => {
    assert.equal(storeSlugFromHost("panaderia-luna.tuapp.com", "tuapp.com"), "panaderia-luna");
    assert.equal(storeSlugFromHost("luna.localhost:3000", "localhost:3000"), "luna");
    assert.equal(storeSlugFromHost("LUNA.TuApp.com", "tuapp.com"), "luna");
  });
  it("returns null for the bare domain, other domains and the app's own host", () => {
    assert.equal(storeSlugFromHost("tuapp.com", "tuapp.com"), null);
    assert.equal(storeSlugFromHost("localhost:3000", "localhost:3000"), null);
    assert.equal(storeSlugFromHost("luna.otro.com", "tuapp.com"), null);
    assert.equal(storeSlugFromHost("shop.tuapp.com", "tuapp.com", "shop.tuapp.com"), null);
    assert.equal(storeSlugFromHost(null, "tuapp.com"), null);
  });
  it("never treats reserved subdomains as stores", () => {
    for (const name of ["www", "app", "api", "admin", "login"]) assert.equal(storeSlugFromHost(`${name}.tuapp.com`, "tuapp.com"), null);
  });
  it("rejects malformed and nested hosts", () => {
    assert.equal(storeSlugFromHost("a.b.tuapp.com", "tuapp.com"), null);
    assert.equal(storeSlugFromHost("-luna.tuapp.com", "tuapp.com"), null);
    assert.equal(storeSlugFromHost("lu_na.tuapp.com", "tuapp.com"), null);
    assert.equal(storeSlugFromHost("ab.tuapp.com", "tuapp.com"), null);
    assert.equal(storeSlugFromHost(`${"a".repeat(61)}.tuapp.com`, "tuapp.com"), null);
    assert.equal(storeSlugFromHost("lu na.tuapp.com", "tuapp.com"), null);
  });
  it("does not match a host that merely ends with the same letters", () => {
    assert.equal(storeSlugFromHost("lunatuapp.com", "tuapp.com"), null);
  });
});

describe("brand color", () => {
  it("accepts valid hex colors and falls back to black otherwise", () => {
    assert.equal(safeBrandColor("#D4F269"), "#d4f269");
    assert.equal(safeBrandColor("red"), "#000000");
    assert.equal(safeBrandColor("#fff"), "#000000");
    assert.equal(safeBrandColor("url(javascript:alert(1))"), "#000000");
    assert.equal(safeBrandColor(null), "#000000");
  });
  it("picks readable text for light and dark backgrounds", () => {
    assert.equal(readableTextColor("#ffffff"), "#000000");
    assert.equal(readableTextColor("#d4f269"), "#000000");
    assert.equal(readableTextColor("#000000"), "#ffffff");
    assert.equal(readableTextColor("#1e3a8a"), "#ffffff");
    assert.equal(readableTextColor("not-a-color"), "#ffffff");
  });
});
