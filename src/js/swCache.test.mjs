import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sw = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
const vercel = readFileSync(new URL("../../vercel.json", import.meta.url), "utf8");
const main = readFileSync(new URL("../main.jsx", import.meta.url), "utf8");

test("service worker gebruikt een verse cache en haalt HTML zonder HTTP-cache", () => {
  assert.match(sw, /CACHE_NAME = "transportme-v6"/);
  assert.match(sw, /cache:\s*"no-store"/);
  assert.match(sw, /path === "\/sw\.js"/);
});

test("Vercel verbiedt caching van HTML en de service worker", () => {
  assert.match(vercel, /"source": "\/sw\.js"/);
  assert.match(vercel, /"source": "\/index\.html"/);
  assert.match(vercel, /no-store, no-cache, must-revalidate/);
});

test("client registreert de worker zonder HTTP-cache en ruimt preview-caches op", () => {
  assert.match(main, /updateViaCache:\s*"none"/);
  assert.match(main, /isVercelPreview/);
  assert.match(main, /wisServiceWorkersEnCaches/);
});
