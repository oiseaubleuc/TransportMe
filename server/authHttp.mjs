/**
 * HTTP-laag voor /api/login, /api/logout, /api/session.
 * Werkt in Vite-middleware, Vercel Node en in tests.
 */
import {
  authConfig,
  clientSleutel,
  isSecureReq,
  json,
  leesSessie,
  nieuweSessie,
  originToegestaan,
  parseCookies,
  pinKlopt,
  pogingStatus,
  registreerMislukt,
  sessieCookie,
  setCookieHeader,
  tekenSessie,
  wisPogingen,
  wisSessieCookie,
  COOKIE_SESSIE,
  LOCK_MS,
} from "./authCore.mjs";

function pad(reqLike) {
  try {
    return new URL(reqLike.url || "/", "http://local").pathname;
  } catch {
    return "";
  }
}

export async function leesJsonBody(reqLike) {
  if (reqLike.body != null && typeof reqLike.body === "object" && !Buffer.isBuffer(reqLike.body)) {
    return reqLike.body;
  }
  if (typeof reqLike.body === "string") {
    try {
      return JSON.parse(reqLike.body || "{}");
    } catch {
      return null;
    }
  }
  if (typeof reqLike.json === "function") {
    try {
      return await reqLike.json();
    } catch {
      return null;
    }
  }
  const chunks = [];
  if (typeof reqLike.on === "function") {
    await new Promise((resolve, reject) => {
      reqLike.on("data", c => chunks.push(c));
      reqLike.on("end", resolve);
      reqLike.on("error", reject);
    });
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function sessieUitReq(reqLike) {
  const cfg = authConfig();
  if (!cfg.ok) return null;
  const cookies = parseCookies(reqLike.headers?.cookie);
  return leesSessie(cookies[COOKIE_SESSIE], cfg.secret);
}

export async function dispatchAuth(reqLike) {
  const method = String(reqLike.method || "GET").toUpperCase();
  const path = pad(reqLike);
  const secure = isSecureReq(reqLike);

  if (path === "/api/session" && method === "GET") {
    const cfg = authConfig();
    if (!cfg.ok) return json(503, { ok: false, error: "Toegang is niet ingesteld op de server." });
    const sessie = sessieUitReq(reqLike);
    if (!sessie) return json(401, { ok: false, error: "Niet aangemeld." });
    return json(200, { ok: true, exp: sessie.exp, rol: sessie.rol || "beheerder" });
  }

  if (path === "/api/logout" && method === "POST") {
    if (!originToegestaan(reqLike)) return json(403, { ok: false, error: "Verzoek geweigerd." });
    const res = json(200, { ok: true });
    setCookieHeader(res.headers, wisSessieCookie({ secure }));
    return res;
  }

  if (path === "/api/login" && method === "POST") {
    if (!originToegestaan(reqLike)) return json(403, { ok: false, error: "Verzoek geweigerd." });
    const cfg = authConfig();
    if (!cfg.ok) return json(503, { ok: false, error: "Toegang is niet ingesteld op de server." });
    const key = clientSleutel(reqLike);
    const st = pogingStatus(key);
    if (st.locked) {
      return json(429, {
        ok: false,
        error: "Te veel pogingen. Probeer over 15 minuten opnieuw.",
        retryAfterSec: Math.ceil((st.lockedUntil - Date.now()) / 1000) || Math.ceil(LOCK_MS / 1000),
      });
    }
    const body = await leesJsonBody(reqLike);
    if (!body || typeof body !== "object") return json(400, { ok: false, error: "Ongeldig verzoek." });
    const pin = typeof body.pin === "string" ? body.pin : "";
    const uit = await pinKlopt(pin);
    if (!uit.ok) {
      if (uit.status === 503) return json(503, { ok: false, error: uit.error });
      const lock = registreerMislukt(key);
      if (lock.lockedUntil) {
        return json(429, {
          ok: false,
          error: "Te veel pogingen. Probeer over 15 minuten opnieuw.",
        });
      }
      return json(uit.status || 401, { ok: false, error: uit.error });
    }
    wisPogingen(key);
    const payload = nieuweSessie();
    const token = tekenSessie(payload, cfg.secret);
    const res = json(200, { ok: true, exp: payload.exp, rol: payload.rol });
    setCookieHeader(res.headers, sessieCookie(token, { secure }));
    return res;
  }

  return json(404, { ok: false, error: "Onbekend." });
}

export async function handleAuthRequest(req, res) {
  const out = await dispatchAuth(req);
  const headers = { ...out.headers };
  const setCookie = headers["Set-Cookie"];
  delete headers["Set-Cookie"];
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  if (setCookie) res.setHeader("Set-Cookie", setCookie);
  res.statusCode = out.status;
  res.end(JSON.stringify(out.body));
}

/** Bescherm een later toegevoegde API: sessie verplicht, mutaties met origin-check. */
export function eisSessie(reqLike) {
  const method = String(reqLike.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD" && !originToegestaan(reqLike)) {
    return { ok: false, response: json(403, { ok: false, error: "Verzoek geweigerd." }) };
  }
  const cfg = authConfig();
  if (!cfg.ok) {
    return { ok: false, response: json(503, { ok: false, error: "Toegang is niet ingesteld op de server." }) };
  }
  const sessie = sessieUitReq(reqLike);
  if (!sessie) {
    return { ok: false, response: json(401, { ok: false, error: "Niet aangemeld." }) };
  }
  return { ok: true, sessie };
}
