import assert from "node:assert/strict";
import { test } from "node:test";
import { loginFoutTekst } from "./sessie.js";

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
