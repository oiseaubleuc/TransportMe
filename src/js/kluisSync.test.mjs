import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

const client = readFileSync(new URL("./kluisSync.js", import.meta.url), "utf8");
const core = readFileSync(new URL("../../server/syncCore.mjs", import.meta.url), "utf8");

test("client deelt de kluis na login en houdt de code lokaal", () => {
  assert.match(client, /syncNaLogin/);
  assert.match(client, /haalKluisSync/);
  assert.match(client, /stuurKluisSync/);
  assert.equal(client.includes("JSON.stringify({ pin"), false);
});

test("server bewaart alleen ciphertext", () => {
  assert.match(core, /tmenc:1:/);
  assert.match(core, /Alleen versleutelde gegevens/);
  assert.match(core, /BLOB_READ_WRITE_TOKEN/);
});
