/**
 * Server-side toegang: scrypt-pincode, HMAC-sessie, poginglimiet, CSRF-origin.
 * Geheimen komen uitsluitend uit process.env (geen VITE_*, geen defaults).
 */
import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

export const COOKIE_SESSIE = "tm_sess";
export const SESSION_TTL_SEC = 8 * 60 * 60;
export const MAX_MISLUKT = 5;
export const LOCK_MS = 15 * 60 * 1000;
export const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32, maxmem: 64 * 1024 * 1024 };

const pogingen = new Map();

function trimEnv(name) {
  return String(process.env[name] || "").trim();
}

export function authConfig() {
  const hash = trimEnv("AUTH_PIN_HASH");
  const salt = trimEnv("AUTH_PIN_SALT");
  const secret = trimEnv("SESSION_SECRET");
  const pepper = trimEnv("AUTH_PEPPER");
  if (!/^[a-fA-F0-9]{64}$/.test(hash)) return { ok: false, reden: "AUTH_PIN_HASH" };
  if (!/^[a-fA-F0-9]{32,64}$/.test(salt)) return { ok: false, reden: "AUTH_PIN_SALT" };
  if (secret.length < 32) return { ok: false, reden: "SESSION_SECRET" };
  return { ok: true, hash, salt, secret, pepper };
}

export async function hashPin(pin, saltHex, pepper) {
  const salt = Buffer.from(saltHex, "hex");
  const buf = await scryptAsync(String(pin) + String(pepper || ""), salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: SCRYPT.maxmem,
  });
  return buf.toString("hex");
}

export function veiligGelijk(a, b) {
  const x = Buffer.from(String(a), "utf8");
  const y = Buffer.from(String(b), "utf8");
  if (x.length !== y.length) {
    timingSafeEqual(x, x);
    return false;
  }
  return timingSafeEqual(x, y);
}

export async function pinKlopt(pin) {
  const cfg = authConfig();
  if (!cfg.ok) return { ok: false, status: 503, error: "Toegang is niet ingesteld op de server." };
  if (typeof pin !== "string" || pin.length < 4 || pin.length > 64) {
    return { ok: false, status: 400, error: "Ongeldige toegangscode." };
  }
  const got = await hashPin(pin, cfg.salt, cfg.pepper);
  if (!veiligGelijk(got, cfg.hash)) {
    return { ok: false, status: 401, error: "Verkeerde toegangscode." };
  }
  return { ok: true, cfg };
}

export function clientSleutel(reqLike) {
  const xf = String(reqLike.headers?.["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  const ip = xf || String(reqLike.ip || reqLike.socket?.remoteAddress || "0");
  return ip.slice(0, 64) || "0";
}

export function pogingStatus(key, now = Date.now()) {
  const row = pogingen.get(key);
  if (!row) return { locked: false, fails: 0 };
  if (row.lockedUntil && now < row.lockedUntil) {
    return { locked: true, fails: row.fails, lockedUntil: row.lockedUntil };
  }
  if (row.lockedUntil && now >= row.lockedUntil) {
    pogingen.delete(key);
    return { locked: false, fails: 0 };
  }
  return { locked: false, fails: row.fails || 0 };
}

export function registreerMislukt(key, now = Date.now()) {
  const cur = pogingen.get(key) || { fails: 0, lockedUntil: 0 };
  const fails = (cur.fails || 0) + 1;
  const lockedUntil = fails >= MAX_MISLUKT ? now + LOCK_MS : 0;
  pogingen.set(key, { fails, lockedUntil });
  return { fails, lockedUntil };
}

export function wisPogingen(key) {
  pogingen.delete(key);
}

/** Alleen voor tests. */
export function resetPogingen() {
  pogingen.clear();
}

export function tekenSessie(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function leesSessie(token, secret, now = Date.now()) {
  if (!token || typeof token !== "string" || !secret) return null;
  const i = token.lastIndexOf(".");
  if (i < 1) return null;
  const body = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expect = createHmac("sha256", secret).update(body).digest("base64url");
  if (!veiligGelijk(sig, expect)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || payload.v !== 1) return null;
  if (typeof payload.exp !== "number" || payload.exp * 1000 <= now) return null;
  return payload;
}

export function nieuweSessie(now = Date.now()) {
  const iat = Math.floor(now / 1000);
  return {
    v: 1,
    iat,
    exp: iat + SESSION_TTL_SEC,
    n: randomBytes(16).toString("hex"),
    rol: "beheerder",
  };
}

export function cookieOpties({ secure, maxAge }) {
  const parts = [
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${Math.max(0, Number(maxAge) || 0)}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function sessieCookie(token, { secure, ttl = SESSION_TTL_SEC } = {}) {
  return `${COOKIE_SESSIE}=${token}; ${cookieOpties({ secure, maxAge: ttl })}`;
}

export function wisSessieCookie({ secure } = {}) {
  return `${COOKIE_SESSIE}=; ${cookieOpties({ secure, maxAge: 0 })}`;
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=");
    if (i < 1) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

export function hostVanUrl(value) {
  try {
    return new URL(value).host;
  } catch {
    return "";
  }
}

/**
 * Cookie-mutaties: Origin of Referer moet bij deze host horen.
 * Geen Origin/Referer → weigeren (fail closed).
 */
export function originToegestaan(reqLike) {
  const host = String(reqLike.headers?.host || "").split(",")[0].trim();
  if (!host) return false;
  const origin = String(reqLike.headers?.origin || "").trim();
  if (origin) return hostVanUrl(origin) === host;
  const referer = String(reqLike.headers?.referer || "").trim();
  if (referer) return hostVanUrl(referer) === host;
  return false;
}

export function isSecureReq(reqLike) {
  if (process.env.VERCEL === "1") return true;
  const xf = String(reqLike.headers?.["x-forwarded-proto"] || "");
  if (xf.split(",")[0].trim() === "https") return true;
  return process.env.NODE_ENV === "production";
}

export function json(status, body, extraHeaders = {}) {
  return {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
    body,
  };
}

export function setCookieHeader(headers, cookie) {
  const prev = headers["Set-Cookie"];
  if (!prev) headers["Set-Cookie"] = cookie;
  else if (Array.isArray(prev)) headers["Set-Cookie"] = [...prev, cookie];
  else headers["Set-Cookie"] = [prev, cookie];
}
