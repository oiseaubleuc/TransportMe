import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomBytes } from "node:crypto";
import {
  authConfig,
  hashPin,
  leesSessie,
  nieuweSessie,
  pinKlopt,
  resetPogingen,
  tekenSessie,
  SESSION_TTL_SEC,
} from "./authCore.mjs";
import { dispatchAuth } from "./authHttp.mjs";

const PIN = "test-code-9321";
const salt = randomBytes(16).toString("hex");
const pepper = randomBytes(16).toString("hex");
const secret = randomBytes(32).toString("hex");

before(async () => {
  process.env.AUTH_PIN_SALT = salt;
  process.env.AUTH_PEPPER = pepper;
  process.env.SESSION_SECRET = secret;
  process.env.AUTH_PIN_HASH = await hashPin(PIN, salt, pepper);
  resetPogingen();
});

after(() => {
  resetPogingen();
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

test("config weigert ontbrekende geheimen", () => {
  const prev = { ...process.env };
  delete process.env.AUTH_PIN_HASH;
  assert.equal(authConfig().ok, false);
  process.env.AUTH_PIN_HASH = prev.AUTH_PIN_HASH;
});

test("juiste pincode, verkeerde pincode", async () => {
  assert.equal((await pinKlopt(PIN)).ok, true);
  assert.equal((await pinKlopt("0000")).ok, false);
  assert.equal((await pinKlopt("0000")).status, 401);
});

test("login zet HttpOnly SameSite-cookie, sessionStorage speelt geen rol", async () => {
  const res = await dispatchAuth(req("POST", "/api/login", { body: { pin: PIN } }));
  assert.equal(res.status, 200);
  const cookie = res.headers["Set-Cookie"];
  assert.match(String(cookie), /tm_sess=/);
  assert.match(String(cookie), /HttpOnly/i);
  assert.match(String(cookie), /SameSite=Strict/i);
  assert.equal(res.body.ok, true);
});

test("session zonder cookie is 401; met cookie 200", async () => {
  const login = await dispatchAuth(req("POST", "/api/login", { body: { pin: PIN } }));
  const raw = String(login.headers["Set-Cookie"]).split(";")[0];
  const no = await dispatchAuth(req("GET", "/api/session"));
  assert.equal(no.status, 401);
  const ok = await dispatchAuth(
    req("GET", "/api/session", { headers: { cookie: raw, origin: undefined } })
  );
  assert.equal(ok.status, 200);
});

test("verlopen sessie wordt geweigerd", () => {
  const payload = nieuweSessie(Date.now() - (SESSION_TTL_SEC + 10) * 1000);
  payload.exp = Math.floor(Date.now() / 1000) - 10;
  const token = tekenSessie(payload, secret);
  assert.equal(leesSessie(token, secret), null);
});

test("vervalste sessie-handtekening wordt geweigerd", () => {
  const token = tekenSessie(nieuweSessie(), secret);
  const [body] = token.split(".");
  assert.equal(leesSessie(`${body}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`, secret), null);
});

test("login zonder Origin is CSRF-blokkade", async () => {
  const res = await dispatchAuth(
    req("POST", "/api/login", {
      headers: { origin: "", referer: "" },
      body: { pin: PIN },
    })
  );
  assert.equal(res.status, 403);
});

test("logout wist cookie en vereist origin", async () => {
  const bad = await dispatchAuth(req("POST", "/api/logout", { headers: { origin: "https://evil.example" } }));
  assert.equal(bad.status, 403);
  const ok = await dispatchAuth(req("POST", "/api/logout"));
  assert.equal(ok.status, 200);
  assert.match(String(ok.headers["Set-Cookie"]), /Max-Age=0/);
});

test("poginglimiet na 5 fouten", async () => {
  resetPogingen();
  const ip = "10.9.8.7";
  for (let i = 0; i < 5; i++) {
    const r = await dispatchAuth(req("POST", "/api/login", { body: { pin: "fout" }, ip }));
    assert.ok(r.status === 401 || r.status === 429);
  }
  const locked = await dispatchAuth(req("POST", "/api/login", { body: { pin: PIN }, ip }));
  assert.equal(locked.status, 429);
  resetPogingen();
});

test("geen publieke registratie", async () => {
  const res = await dispatchAuth(req("POST", "/api/auth/signup", { body: { email: "a@b.c", password: "x" } }));
  assert.equal(res.status, 404);
});
