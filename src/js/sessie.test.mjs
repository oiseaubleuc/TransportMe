import assert from "node:assert/strict";
import { test } from "node:test";
import { loginFoutTekst, magLokaleToegang } from "./sessie.js";

test("503 noemt ontbrekende servervariabelen", () => {
  const t = loginFoutTekst({
    status: 503,
    body: { error: "Toegang is niet ingesteld op de server.", ontbreekt: ["AUTH_PIN_HASH", "AUTH_PEPPER"] },
  });
  assert.match(t, /AUTH_PIN_HASH/);
  assert.match(t, /Redeploy/);
});

test("404 wijst op ontbrekende loginserver", () => {
  const t = loginFoutTekst({ status: 404, body: { error: "NOT_FOUND" } });
  assert.match(t, /loginserver ontbreekt/);
});

test("Vercel Deployment Protection is geen verkeerde pincode", () => {
  const t = loginFoutTekst({
    status: 401,
    body: { error: { code: "401", message: "Protected deployment" }, protection: { vercel_auth_enabled: true } },
  });
  assert.match(t, /Vercel/);
  assert.equal(t.includes("Verkeerde toegangscode"), false);
});

test("gewone 401 blijft verkeerde toegangscode", () => {
  const t = loginFoutTekst({ status: 401, body: { error: "Verkeerde toegangscode." } });
  assert.equal(t, "Verkeerde toegangscode.");
});

test("zonder serverhashes mag de lokale kluis open", () => {
  assert.equal(magLokaleToegang({ status: 503, body: { ontbreekt: ["AUTH_PIN_HASH"] } }), true);
  assert.equal(magLokaleToegang({ status: 404 }), true);
  assert.equal(magLokaleToegang({ status: 401, body: { error: "Verkeerde toegangscode." } }), false);
  assert.equal(magLokaleToegang({ status: 401, body: { protection: {} } }), false);
});
