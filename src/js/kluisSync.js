/**
 * Deelt de versleutelde kluis tussen toestellen na login.
 * De server krijgt ciphertext; de toegangscode blijft op het toestel.
 */
import { applyImportPayload, collectExportPayload } from "./dataBackup.js";
import { PROFILES } from "./config.js";
import { kluisFlush, kluisHerladen, kluisMeta, lsGet, openKluis, ruweGet, ruweSet, sluitKluis, zetNaKluisSchrijven } from "./veiligeOpslag.js";

export const SYNC_AT_KEY = "tm_sync_at";
export const SYNC_DIRTY_KEY = "tm_sync_dirty";

const WACHT_MS = 1600;
const EVENT = "tm-kluis-sync";

let timer = 0;
let bezig = false;
let actief = false;
let status = { fase: "stil", updatedAt: 0, fout: "", ontbreekt: [] };
const luisteraars = new Set();

export function kluisSyncStatus() {
  return status;
}

export function onKluisSyncStatus(fn) {
  luisteraars.add(fn);
  return () => luisteraars.delete(fn);
}

function zetStatus(deel) {
  status = { ...status, ...deel };
  for (const fn of luisteraars) {
    try {
      fn(status);
    } catch {
      /* */
    }
  }
}

function meldVerverst() {
  try {
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* */
  }
}

function zelfdeZout(remote) {
  try {
    const m = JSON.parse(remote.keys.tm_kluis);
    return !!(m?.zout && kluisMeta()?.zout === m.zout);
  } catch {
    return false;
  }
}

export function lokaleRittenLeeg() {
  return PROFILES.every(p => {
    const raw = lsGet("t_" + p.id);
    if (!raw) return true;
    try {
      const d = JSON.parse(raw);
      const r = Array.isArray(d?.r) ? d.r : [];
      const b = Array.isArray(d?.b) ? d.b : [];
      const o = Array.isArray(d?.o) ? d.o : [];
      return r.length === 0 && b.length === 0 && o.length === 0;
    } catch {
      return true;
    }
  });
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
    const err = new Error(typeof body.error === "string" ? body.error : "Mislukt");
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export async function haalKluisSync() {
  const res = await fetch("/api/sync", {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (res.status === 401 || res.status === 403 || res.status === 404) return null;
  return leesJson(res);
}

export async function stuurKluisSync() {
  await kluisFlush();
  const payload = collectExportPayload();
  const updatedAt = Date.now();
  const res = await fetch("/api/sync", {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ v: 1, updatedAt, keys: payload.keys }),
  });
  const body = await leesJson(res);
  const at = Number(body.updatedAt) || updatedAt;
  ruweSet(SYNC_AT_KEY, String(at));
  ruweSet(SYNC_DIRTY_KEY, "0");
  zetStatus({ fase: "ok", updatedAt: at, fout: "", ontbreekt: [] });
  return { soort: "verstuurd", updatedAt: at };
}

function markeerDirty() {
  try {
    ruweSet(SYNC_DIRTY_KEY, "1");
  } catch {
    /* */
  }
}

export function planKluisSync() {
  if (!actief) return;
  markeerDirty();
  zetStatus({ fase: "wacht" });
  if (timer) clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = 0;
    stuurKluisSync().catch(err => {
      const ontbreekt = err?.body?.ontbreekt;
      zetStatus({
        fase: Array.isArray(ontbreekt) && ontbreekt.length ? "niet-ingesteld" : "fout",
        fout: String(err?.message || "Synchroniseren mislukt."),
        ontbreekt: Array.isArray(ontbreekt) ? ontbreekt : [],
      });
    });
  }, WACHT_MS);
}

export async function syncNaLogin(pin) {
  zetStatus({ fase: "bezig", fout: "", ontbreekt: [] });
  let remote = null;
  try {
    remote = await haalKluisSync();
  } catch (err) {
    const ontbreekt = err?.body?.ontbreekt;
    if (Array.isArray(ontbreekt) && ontbreekt.length) {
      zetStatus({ fase: "niet-ingesteld", ontbreekt, fout: "" });
      return { soort: "niet-ingesteld" };
    }
    zetStatus({ fase: "lokaal", fout: "" });
    return { soort: "lokaal" };
  }
  if (!remote) {
    zetStatus({ fase: "lokaal", fout: "" });
    return { soort: "lokaal" };
  }
  if (Array.isArray(remote.ontbreekt) && remote.ontbreekt.length) {
    zetStatus({ fase: "niet-ingesteld", ontbreekt: remote.ontbreekt, fout: "" });
    return { soort: "niet-ingesteld" };
  }

  const localAt = Number(ruweGet(SYNC_AT_KEY) || 0);
  const dirty = ruweGet(SYNC_DIRTY_KEY) === "1";
  const leegLokaal = lokaleRittenLeeg();
  const remoteNieuw =
    !remote.leeg && remote.keys && typeof remote.keys === "object" && Object.keys(remote.keys).some(k => k.startsWith("t_"));
  const remoteAt = Number(remote.updatedAt) || 0;

  if (remoteNieuw && (leegLokaal || (!dirty && remoteAt > localAt))) {
    await applyImportPayload({ keys: remote.keys, transporteurBackupVersion: 3 }, { replaceAll: true });
    ruweSet(SYNC_AT_KEY, String(remoteAt || Date.now()));
    ruweSet(SYNC_DIRTY_KEY, "0");
    sluitKluis();
    await openKluis(pin);
    zetStatus({ fase: "ok", updatedAt: remoteAt, fout: "", ontbreekt: [] });
    meldVerverst();
    return { soort: "gehaald", updatedAt: remoteAt };
  }

  try {
    const uit = await stuurKluisSync();
    return uit;
  } catch (err) {
    const ontbreekt = err?.body?.ontbreekt;
    if (Array.isArray(ontbreekt) && ontbreekt.length) {
      zetStatus({ fase: "niet-ingesteld", ontbreekt, fout: "" });
      return { soort: "niet-ingesteld" };
    }
    zetStatus({ fase: "fout", fout: String(err?.message || "Synchroniseren mislukt.") });
    return { soort: "fout" };
  }
}

function opZichtbaar() {
  if (document.visibilityState !== "visible") {
    if (ruweGet(SYNC_DIRTY_KEY) === "1") stuurKluisSync().catch(() => {});
    return;
  }
  if (bezig || ruweGet(SYNC_DIRTY_KEY) === "1") return;
  bezig = true;
  haalKluisSync()
    .then(async remote => {
      if (!remote || remote.leeg || !remote.keys) return;
      const localAt = Number(ruweGet(SYNC_AT_KEY) || 0);
      const remoteAt = Number(remote.updatedAt) || 0;
      if (remoteAt <= localAt) return;
      if (!zelfdeZout(remote)) return;
      await applyImportPayload({ keys: remote.keys, transporteurBackupVersion: 3 }, { replaceAll: true });
      await kluisHerladen();
      ruweSet(SYNC_AT_KEY, String(remoteAt));
      ruweSet(SYNC_DIRTY_KEY, "0");
      meldVerverst();
      zetStatus({ fase: "ok", updatedAt: remoteAt, fout: "" });
    })
    .catch(() => {})
    .finally(() => {
      bezig = false;
    });
}

export function startKluisSync() {
  actief = true;
  zetNaKluisSchrijven(planKluisSync);
  document.addEventListener("visibilitychange", opZichtbaar);
  window.addEventListener("pagehide", opZichtbaar);
  window.addEventListener("online", planKluisSync);
}

export function stopKluisSync() {
  actief = false;
  zetNaKluisSchrijven(null);
  if (timer) {
    clearTimeout(timer);
    timer = 0;
  }
  document.removeEventListener("visibilitychange", opZichtbaar);
  window.removeEventListener("pagehide", opZichtbaar);
  window.removeEventListener("online", planKluisSync);
}

export const KLUIS_SYNC_EVENT = EVENT;
