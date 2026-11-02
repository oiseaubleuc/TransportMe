/**
 * localStorage-wrapper: gevoelige sleutels als AES-GCM-envelop na openKluis.
 * Zonder open kluis: versleutelde waarden zijn onleesbaar; plaintext blijft tot migratie.
 */
import {
  isKluisEnvelope,
  KLUIS_META_KEY,
  leidSleutelAf,
  ontsleutelTekst,
  standaardMeta,
  nieuweZout,
  versleutelTekst,
} from "./kluisCrypto.js";
import { DATA_RETENTION_DAYS } from "./config.js";

const PUBLIEK = new Set([KLUIS_META_KEY, "tm_melding_route", "tm_sync_at", "tm_sync_dirty"]);

let naSchrijven = null;

/** Na een lokale wijziging (bv. kluis naar de server sturen). */
export function zetNaKluisSchrijven(fn) {
  naSchrijven = typeof fn === "function" ? fn : null;
}

let sleutel = null;
let meta = null;
let open = false;
const cache = new Map();
let wachtrij = Promise.resolve();

function nativeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function nativeSet(key, val) {
  localStorage.setItem(key, val);
}

function nativeRemove(key) {
  localStorage.removeItem(key);
}

export function isGevoeligeSleutel(key) {
  if (typeof key !== "string" || PUBLIEK.has(key)) return false;
  if (key.startsWith("t_")) return true;
  if (key.startsWith("transporteur_")) return true;
  if (key === "tp") return true;
  return false;
}

export function kluisOpen() {
  return open && !!sleutel;
}

/** Alleen in-memory CryptoKey; nooit serialiseren of in opslag zetten. */
export function huidigeKluisSleutel() {
  return kluisOpen() ? sleutel : null;
}

export function kluisMeta() {
  return meta;
}

export function bewaarDagen() {
  const n = Number(meta?.retentionDays);
  if (Number.isFinite(n) && n >= 1 && n <= 3650) return Math.floor(n);
  return DATA_RETENTION_DAYS;
}

function leesMeta() {
  try {
    const raw = nativeGet(KLUIS_META_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || o.v !== 1 || !o.zout) return null;
    return o;
  } catch {
    return null;
  }
}

function schrijfMeta(next) {
  nativeSet(KLUIS_META_KEY, JSON.stringify(next));
  meta = next;
}

export function ruweGet(key) {
  return nativeGet(key);
}

export function ruweSet(key, val) {
  nativeSet(key, val);
}

export function ruweRemove(key) {
  nativeRemove(key);
}

export function lsGet(key) {
  const raw = nativeGet(key);
  if (raw == null) return null;
  if (isKluisEnvelope(raw)) return kluisOpen() && cache.has(key) ? cache.get(key) : null;
  return raw;
}

export async function lsGetAsync(key) {
  const raw = nativeGet(key);
  if (raw == null) return null;
  if (!isKluisEnvelope(raw)) return raw;
  if (!kluisOpen()) return null;
  if (cache.has(key)) return cache.get(key);
  const pt = await ontsleutelTekst(sleutel, raw);
  cache.set(key, pt);
  return pt;
}

export async function lsSetAsync(key, val) {
  const s = String(val);
  if (!isGevoeligeSleutel(key) || !kluisOpen()) {
    nativeSet(key, s);
    cache.delete(key);
    return;
  }
  const enc = await versleutelTekst(sleutel, s);
  const check = await ontsleutelTekst(sleutel, enc);
  if (check !== s) throw new Error("Versleuteling kon niet worden gecontroleerd");
  nativeSet(key, enc);
  cache.set(key, s);
}

export function lsSet(key, val) {
  const s = String(val);
  if (!isGevoeligeSleutel(key) || !kluisOpen()) {
    nativeSet(key, s);
    cache.delete(key);
    return;
  }
  cache.set(key, s);
  wachtrij = wachtrij.then(() => lsSetAsync(key, s)).catch(err => {
    console.error("Kluis schrijven mislukt", err);
  });
  try {
    naSchrijven?.();
  } catch {
    /* */
  }
}

export function lsRemove(key) {
  cache.delete(key);
  nativeRemove(key);
  try {
    naSchrijven?.();
  } catch {
    /* */
  }
}

export async function kluisFlush() {
  await wachtrij;
}

function eersteEnvelope() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !isGevoeligeSleutel(k)) continue;
      const v = nativeGet(k);
      if (isKluisEnvelope(v)) return v;
    }
  } catch {
    /* */
  }
  return null;
}

export async function migreerLocalStorage() {
  if (!kluisOpen()) return { versleuteld: 0, overgeslagen: 0, fout: 0 };
  let versleuteld = 0;
  let overgeslagen = 0;
  let fout = 0;
  const keys = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) keys.push(k);
    }
  } catch {
    return { versleuteld, overgeslagen, fout: 1 };
  }
  for (const k of keys) {
    if (!isGevoeligeSleutel(k)) continue;
    const raw = nativeGet(k);
    if (raw == null) continue;
    if (isKluisEnvelope(raw)) {
      try {
        cache.set(k, await ontsleutelTekst(sleutel, raw));
        overgeslagen++;
      } catch {
        fout++;
      }
      continue;
    }
    try {
      const enc = await versleutelTekst(sleutel, raw);
      const back = await ontsleutelTekst(sleutel, enc);
      if (back !== raw) throw new Error("mismatch");
      nativeSet(k, enc);
      cache.set(k, raw);
      versleuteld++;
    } catch (e) {
      console.error("Migratie kluis mislukt voor", k, e);
      fout++;
    }
  }
  return { versleuteld, overgeslagen, fout };
}

export async function openKluis(pin) {
  let m = leesMeta();
  if (!m) {
    m = standaardMeta(nieuweZout(), DATA_RETENTION_DAYS);
    schrijfMeta(m);
  } else {
    meta = m;
  }
  const key = await leidSleutelAf(pin, m);
  const canary = nativeGet("t_houdaifa") || nativeGet("tp") || eersteEnvelope();
  if (canary && isKluisEnvelope(canary)) {
    await ontsleutelTekst(key, canary);
  }
  sleutel = key;
  open = true;
  cache.clear();
  const migratie = await migreerLocalStorage();
  return { migratie, meta: m };
}

export function sluitKluis() {
  sleutel = null;
  open = false;
  cache.clear();
}

/** Na een geïmporteerde snapshot met hetzelfde zout: cache opnieuw vullen. */
export async function kluisHerladen() {
  if (!kluisOpen()) return { versleuteld: 0, overgeslagen: 0, fout: 0 };
  cache.clear();
  return migreerLocalStorage();
}

export async function zetBewaarDagen(dagen) {
  const n = Math.max(1, Math.min(3650, Math.floor(Number(dagen) || DATA_RETENTION_DAYS)));
  const m = leesMeta() || standaardMeta(nieuweZout(), n);
  m.retentionDays = n;
  schrijfMeta(m);
  return n;
}
