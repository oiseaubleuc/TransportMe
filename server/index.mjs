/**
 * Lokale accounts + ritdata. Zelfde server = dezelfde gegevens op elk toestel.
 * Start via de Vite-plugin of: node server/index.mjs
 */
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const PORT = Number(process.env.AUTH_PORT || 8787);
const EXPOSE_RESET = process.env.AUTH_EXPOSE_RESET !== "0";
const ROOT = dirname(fileURLToPath(import.meta.url));
const FILE = join(ROOT, "data", "accounts.json");

const emptyData = () => ({ r: [], b: [], o: [], xr: [], xrArch: [] });
const emptyBundle = () => ({ data: emptyData(), factuur: {}, factuurTeller: {}, calcFix: "" });

function loadStore() {
  try {
    const raw = JSON.parse(readFileSync(FILE, "utf8"));
    return {
      users: Array.isArray(raw.users) ? raw.users : [],
      sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
      resets: Array.isArray(raw.resets) ? raw.resets : [],
      bundles: raw.bundles && typeof raw.bundles === "object" ? raw.bundles : {},
    };
  } catch {
    return { users: [], sessions: [], resets: [], bundles: {} };
  }
}

let store = loadStore();
let writing = Promise.resolve();

function persist() {
  const snap = JSON.stringify(store);
  writing = writing.then(() => {
    mkdirSync(dirname(FILE), { recursive: true });
    writeFileSync(FILE, snap);
  });
  return writing;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function newId() {
  return randomBytes(16).toString("hex");
}

async function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const buf = await scryptAsync(password, salt, 32);
  return { salt, hash: buf.toString("hex") };
}

async function passwordOk(password, salt, hash) {
  const buf = await scryptAsync(password, salt, 32);
  const want = Buffer.from(hash, "hex");
  if (buf.length !== want.length) return false;
  return timingSafeEqual(buf, want);
}

function emailOk(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name };
}

function bundleFor(userId) {
  if (!store.bundles[userId]) store.bundles[userId] = emptyBundle();
  const b = store.bundles[userId];
  if (!b.data) b.data = emptyData();
  if (!b.factuur || typeof b.factuur !== "object") b.factuur = {};
  if (!b.factuurTeller || typeof b.factuurTeller !== "object") b.factuurTeller = {};
  return b;
}

function bearer(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

function sessionUser(req) {
  const token = bearer(req);
  if (!token) return null;
  const now = Date.now();
  const hash = sha256(token);
  const session = store.sessions.find(s => s.tokenHash === hash && s.expiresAt > now);
  if (!session) return null;
  return store.users.find(u => u.id === session.userId) || null;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("Ongeldige JSON"));
      }
    });
    req.on("error", reject);
  });
}

function send(res, status, body) {
  const raw = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(raw);
}

async function handle(req, res) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const path = url.pathname;
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "POST" && path === "/api/auth/signup") {
    const body = await readJson(req);
    const email = String(body.email || "").trim().toLowerCase();
    const name = String(body.name || "").trim();
    const password = String(body.password || "");
    if (!emailOk(email)) return send(res, 400, { error: "Ongeldig e-mailadres." });
    if (name.length < 1 || name.length > 80) return send(res, 400, { error: "Vul een naam in." });
    if (password.length < 8) return send(res, 400, { error: "Wachtwoord minstens 8 tekens." });
    if (store.users.some(u => u.email === email)) return send(res, 409, { error: "Dit e-mailadres bestaat al." });
    const { salt, hash } = await hashPassword(password);
    const user = { id: newId(), email, name, salt, hash, createdAt: Date.now() };
    store.users.push(user);
    bundleFor(user.id);
    const token = randomBytes(32).toString("base64url");
    store.sessions.push({
      id: newId(),
      userId: user.id,
      tokenHash: sha256(token),
      expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 14,
    });
    await persist();
    return send(res, 201, { token, user: publicUser(user), bundle: bundleFor(user.id) });
  }

  if (req.method === "POST" && path === "/api/auth/login") {
    const body = await readJson(req);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const user = store.users.find(u => u.email === email);
    if (!user || !(await passwordOk(password, user.salt, user.hash))) {
      return send(res, 401, { error: "Onjuist e-mailadres of wachtwoord." });
    }
    const token = randomBytes(32).toString("base64url");
    store.sessions.push({
      id: newId(),
      userId: user.id,
      tokenHash: sha256(token),
      expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 14,
    });
    await persist();
    return send(res, 200, { token, user: publicUser(user), bundle: bundleFor(user.id) });
  }

  if (req.method === "POST" && path === "/api/auth/logout") {
    const token = bearer(req);
    if (token) {
      const hash = sha256(token);
      store.sessions = store.sessions.filter(s => s.tokenHash !== hash);
      await persist();
    }
    return send(res, 200, { ok: true });
  }

  if (req.method === "GET" && path === "/api/auth/me") {
    const user = sessionUser(req);
    if (!user) return send(res, 401, { error: "Niet ingelogd." });
    return send(res, 200, { user: publicUser(user), bundle: bundleFor(user.id) });
  }

  if (req.method === "POST" && path === "/api/auth/forgot") {
    const body = await readJson(req);
    const email = String(body.email || "").trim().toLowerCase();
    const user = emailOk(email) ? store.users.find(u => u.email === email) : null;
    let resetToken = null;
    if (user) {
      resetToken = randomBytes(32).toString("base64url");
      store.resets = store.resets.filter(r => r.userId !== user.id);
      store.resets.push({
        userId: user.id,
        tokenHash: sha256(resetToken),
        expiresAt: Date.now() + 1000 * 60 * 30,
      });
      await persist();
    }
    const payload = { ok: true };
    if (user && EXPOSE_RESET) payload.resetToken = resetToken;
    return send(res, 200, payload);
  }

  if (req.method === "POST" && path === "/api/auth/reset") {
    const body = await readJson(req);
    const token = String(body.token || "");
    const password = String(body.password || "");
    if (password.length < 8) return send(res, 400, { error: "Wachtwoord minstens 8 tekens." });
    const now = Date.now();
    const hash = sha256(token);
    const reset = store.resets.find(r => r.tokenHash === hash && r.expiresAt > now);
    if (!reset) return send(res, 400, { error: "Link ongeldig of verlopen." });
    const user = store.users.find(u => u.id === reset.userId);
    if (!user) return send(res, 400, { error: "Link ongeldig of verlopen." });
    const next = await hashPassword(password);
    user.salt = next.salt;
    user.hash = next.hash;
    store.resets = store.resets.filter(r => r.userId !== user.id);
    store.sessions = store.sessions.filter(s => s.userId !== user.id);
    await persist();
    return send(res, 200, { ok: true });
  }

  if (req.method === "GET" && path === "/api/data") {
    const user = sessionUser(req);
    if (!user) return send(res, 401, { error: "Niet ingelogd." });
    return send(res, 200, { bundle: bundleFor(user.id) });
  }

  if (req.method === "PUT" && path === "/api/data") {
    const user = sessionUser(req);
    if (!user) return send(res, 401, { error: "Niet ingelogd." });
    const body = await readJson(req);
    const cur = bundleFor(user.id);
    if (body.data && typeof body.data === "object") cur.data = body.data;
    if (body.factuur && typeof body.factuur === "object") cur.factuur = body.factuur;
    if (body.factuurTeller && typeof body.factuurTeller === "object") cur.factuurTeller = body.factuurTeller;
    if (typeof body.calcFix === "string") cur.calcFix = body.calcFix;
    await persist();
    return send(res, 200, { ok: true });
  }

  send(res, 404, { error: "Niet gevonden." });
}

const server = createServer((req, res) => {
  handle(req, res).catch(err => {
    send(res, 400, { error: err?.message || "Mislukt" });
  });
});

server.on("error", err => {
  if (err.code === "EADDRINUSE") return;
  console.error(err);
});

server.listen(PORT, "127.0.0.1");
