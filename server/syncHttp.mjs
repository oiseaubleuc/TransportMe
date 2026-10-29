/**
 * HTTP voor /api/sync. GET haalt de versleutelde kluis, PUT bewaart die.
 * Sessie verplicht; mutaties met Origin-check. Geen pincode in dit kanaal.
 */
import { json } from "./authCore.mjs";
import { eisSessie, leesJsonBody } from "./authHttp.mjs";
import { leesSnapshot, schrijfSnapshot, snapshotHeeftData } from "./syncCore.mjs";

function pad(reqLike) {
  try {
    return new URL(reqLike.url || "/", "http://local").pathname;
  } catch {
    return "";
  }
}

export async function dispatchSync(reqLike) {
  const method = String(reqLike.method || "GET").toUpperCase();
  const path = pad(reqLike);
  if (path !== "/api/sync") return json(404, { ok: false, error: "Onbekend." });

  const poort = eisSessie(reqLike);
  if (!poort.ok) return poort.response;

  if (method === "GET" || method === "HEAD") {
    const uit = await leesSnapshot();
    if (!uit.ok) {
      return json(200, { ok: true, leeg: true, ontbreekt: uit.ontbreekt || [] });
    }
    if (!uit.snap) return json(200, { ok: true, leeg: true, updatedAt: 0, keys: {} });
    const leeg = !snapshotHeeftData(uit.snap.keys);
    return json(200, {
      ok: true,
      leeg,
      v: uit.snap.v,
      updatedAt: uit.snap.updatedAt,
      keys: leeg ? {} : uit.snap.keys,
    });
  }

  if (method === "PUT" || method === "POST") {
    const body = await leesJsonBody(reqLike);
    const uit = await schrijfSnapshot(body);
    if (!uit.ok) {
      return json(uit.status || 400, {
        ok: false,
        error: uit.error || "Bewaren mislukt.",
        ontbreekt: uit.ontbreekt || [],
      });
    }
    return json(200, { ok: true, updatedAt: uit.updatedAt });
  }

  return json(405, { ok: false, error: "Methode niet toegestaan." });
}

export async function handleSyncRequest(req, res) {
  const out = await dispatchSync(req);
  const headers = { ...out.headers };
  const setCookie = headers["Set-Cookie"];
  delete headers["Set-Cookie"];
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  if (setCookie) res.setHeader("Set-Cookie", setCookie);
  res.statusCode = out.status;
  res.end(JSON.stringify(out.body));
}
