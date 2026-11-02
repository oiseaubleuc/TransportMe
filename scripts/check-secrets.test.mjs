import assert from "node:assert/strict";
import { test } from "node:test";
import { isGeheimenbestand, scanBestanden, vindLekken } from "./check-secrets.mjs";

test("lege .env.example is geen lek", () => {
  assert.deepEqual(vindLekken(".env.example", "SESSION_SECRET=\nAUTH_PIN_HASH=\n"), []);
});

test("echte hash in een bronbestand is een lek", () => {
  const hash = "a".repeat(64);
  assert.ok(vindLekken("src/x.js", `AUTH_PIN_HASH=${hash}`).includes("AUTH_PIN_HASH-waarde"));
  assert.ok(vindLekken("api/login.js", "VITE_AUTH_PIN=1869").includes("toegang in VITE_"));
});

test(".env en sleutelbestanden mogen niet in git", () => {
  assert.equal(isGeheimenbestand(".env"), true);
  assert.equal(isGeheimenbestand("server/id_rsa"), true);
  assert.equal(isGeheimenbestand("src/js/sessie.js"), false);
});

test("scanBestanden verzamelt alle fouten", () => {
  const fouten = scanBestanden([".env", "src/a.js"], pad =>
    pad === "src/a.js" ? "BLOB_READ_WRITE_TOKEN=" + "vercel_blob_" + "abc123xxxx" : ""
  );
  assert.ok(fouten.some(f => f.includes("geheimenbestand")));
  assert.ok(fouten.some(f => f.includes("BLOB-token")));
});
