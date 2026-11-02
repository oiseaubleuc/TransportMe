import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { hashPin, resetPogingen } from "./authCore.mjs";
import { dispatchAuth } from "./authHttp.mjs";
import { schoonSnapshot, schrijfSnapshot, syncOpslagSoort } from "./syncCore.mjs";
import { dispatchSync } from "./syncHttp.mjs";

const PIN = "test-code-9321";
const salt = randomBytes(16).toString("hex");
const pepper = randomBytes(16).toString("hex");
const secret = randomBytes(32).toString("hex");
const meta = JSON.stringify({
  v: 1,
  kdf: "PBKDF2",
  hash: "SHA-256",
  iter: 210000,
  zout: "YWJjZGVmZ2hpamtsbW5vcA==",
  retentionDays: 62,
});
const envelope = "tmenc:1:" + JSON.stringify({ iv: "AAAAAAAAAAAA", ct: "BBBBBBBBBBBBBBBB" });

let dir = "";

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "tm-sync-"));
  process.env.TM_SYNC_FILE = join(dir, "kluis-sync.json");
  process.env.AUTH_PIN_SALT = salt;
  process.env.AUTH_PEPPER = pepper;
  process.env.SESSION_SECRET = secret;
  process.env.AUTH_PIN_HASH = await hashPin(PIN, salt, pepper);
  resetPogingen();
});

after(async () => {
  resetPogingen();
  delete process.env.TM_SYNC_FILE;
  if (dir) await rm(dir, { recursive: true, force: true });
});

function req(method, url, { headers = {}, body, ip } = {}) {
  return {
    method,
    url,
    ip: ip || "127.0.0.1",
    headers: { host: "localhost:5173", origin: "http://localhost:5173", ...headers },
    body: body ?? {},
  };
}

async function sessieCookie() {
  const login = await dispatchAuth(req("POST", "/api/login", { body: { pin: PIN } }));
  assert.equal(login.status, 200);
  return String(login.headers["Set-Cookie"]).split(";")[0];
}

test("snapshot weigert plaintext ritten", () => {
  const fout = schoonSnapshot({
    updatedAt: 1,
    keys: { tm_kluis: meta, t_houdaifa: JSON.stringify({ r: [{ f: "AZ" }] }) },
  });
  assert.equal(fout.ok, false);
  const goed = schoonSnapshot({
    updatedAt: 1,
    keys: { tm_kluis: meta, t_houdaifa: envelope, pin: "1869" },
  });
  assert.equal(goed.ok, true);
  assert.equal("pin" in goed.snap.keys, false);
});

test("zonder sessie is sync 401", async () => {
  const res = await dispatchSync(req("GET", "/api/sync"));
  assert.equal(res.status, 401);
});

test("PUT zonder Origin is CSRF-blokkade", async () => {
  const cookie = await sessieCookie();
  const res = await dispatchSync(
    req("PUT", "/api/sync", {
      headers: { cookie, origin: "", referer: "" },
      body: { updatedAt: Date.now(), keys: { tm_kluis: meta, t_houdaifa: envelope } },
    })
  );
  assert.equal(res.status, 403);
});

test("lege kluis (alleen meta) telt als leeg, ritten gaan niet verloren", async () => {
  const cookie = await sessieCookie();
  const put = await dispatchSync(
    req("PUT", "/api/sync", {
      headers: { cookie },
      body: { updatedAt: 11, keys: { tm_kluis: meta } },
    })
  );
  assert.equal(put.status, 200);
  const get = await dispatchSync(req("GET", "/api/sync", { headers: { cookie, origin: undefined } }));
  assert.equal(get.status, 200);
  assert.equal(get.body.leeg, true);
});

test("kluis roundtrip na login, pincode staat niet in de snapshot", async () => {
  assert.equal(syncOpslagSoort(), "file");
  const cookie = await sessieCookie();
  const updatedAt = 1700000000000;
  const put = await dispatchSync(
    req("PUT", "/api/sync", {
      headers: { cookie },
      body: { updatedAt, keys: { tm_kluis: meta, t_houdaifa: envelope } },
    })
  );
  assert.equal(put.status, 200);
  assert.equal(put.body.ok, true);
  const get = await dispatchSync(req("GET", "/api/sync", { headers: { cookie, origin: undefined } }));
  assert.equal(get.status, 200);
  assert.equal(get.body.leeg, false);
  assert.equal(get.body.keys.t_houdaifa, envelope);
  assert.equal(JSON.stringify(get.body).includes(PIN), false);
  assert.equal(JSON.stringify(get.body).includes("1869"), false);
});

test("schrijven zonder blob op Vercel blijft gesloten", async () => {
  const prevFile = process.env.TM_SYNC_FILE;
  const prevVercel = process.env.VERCEL;
  delete process.env.TM_SYNC_FILE;
  process.env.VERCEL = "1";
  const uit = await schrijfSnapshot({ updatedAt: 1, keys: { tm_kluis: meta, t_houdaifa: envelope } });
  assert.equal(uit.ok, false);
  assert.equal(uit.status, 503);
  assert.ok(uit.ontbreekt.includes("BLOB_READ_WRITE_TOKEN"));
  process.env.TM_SYNC_FILE = prevFile;
  if (prevVercel == null) delete process.env.VERCEL;
  else process.env.VERCEL = prevVercel;
});
