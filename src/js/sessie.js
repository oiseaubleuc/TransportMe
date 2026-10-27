/**
 * Client voor /api/login|logout|session. Credentials = cookies, geen token in opslag.
 */

function tekstUitFoutbody(body) {
  if (!body || typeof body !== "object") return "";
  if (typeof body.error === "string") return body.error;
  if (typeof body.message === "string") return body.message;
  if (body.error && typeof body.error.message === "string") return body.error.message;
  return "";
}

export function loginFoutTekst(err) {
  const status = err?.status;
  const body = err?.body && typeof err.body === "object" ? err.body : {};
  const tekst = tekstUitFoutbody(body) || String(err?.message || "");
  const vercelBeschermd =
    !!body.protection ||
    tekst.includes("Protected deployment") ||
    tekst.includes("Protected by Vercel");
  if (status === 401 && vercelBeschermd) {
    return "Deze preview is geblokkeerd door Vercel. Zet Deployment Protection uit, of open de productiesite nadat deze versie daar staat.";
  }
  if (status === 404) {
    return "De loginserver ontbreekt op deze website (oude publicatie). Gebruik de preview van deze versie of publiceer die naar Production.";
  }
  if (status === 503) {
    const welke = Array.isArray(body.ontbreekt) && body.ontbreekt.length ? ` (${body.ontbreekt.join(", ")})` : "";
    return `Toegang is niet ingesteld op de server${welke}. Zet SESSION_SECRET, AUTH_PIN_SALT, AUTH_PIN_HASH en AUTH_PEPPER in Vercel bij Production én Preview (geen VITE_, geen aanhalingstekens) en klik daarna Redeploy.`;
  }
  if (status === 429) return tekst || "Te veel pogingen. Probeer later opnieuw.";
  if (status === 403) return tekst || "Verzoek geweigerd.";
  return tekst || "Verkeerde toegangscode.";
}

async function leesJson(res) {
  const raw = await res.text();
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = { error: raw.slice(0, 180) || "Mislukt" };
  }
  if (!res.ok) {
    const err = new Error(tekstUitFoutbody(body) || "Mislukt");
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export async function apiLogin(pin) {
  const res = await fetch("/api/login", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ pin }),
  });
  return leesJson(res);
}

export async function apiLogout() {
  try {
    await fetch("/api/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: "{}",
    });
  } catch {
    /* lokale kluis gaat toch dicht */
  }
}

export async function apiSessie() {
  const res = await fetch("/api/session", {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (res.status === 401) return null;
  return leesJson(res);
}
