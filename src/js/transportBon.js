/**
 * Transportbon (IHcT): tekst → vertrek, bestemming, datum, uur, bonnummer.
 * Km uit de prijslijst, anders over de weg. Tarief via vergoedingVoorRit.
 */

import { PRESET_ANCHOR_ZIEKENHUIZEN, ALL_PRESET_ROUTES } from "./config.js";
import { vergoedingVoorRit, isNachtTariefTijd } from "./calculations.js";
import { getDrivingRouteKm } from "./ors.js";

export const IHCT_RE = /[Iil1]H[cC][tT]\s*[A-Za-z0-9]{4,}/;

function pad2(n) {
  return String(n).padStart(2, "0");
}

export function canonPlaats(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[()[\]{}.,'’`]/g, " ")
    .replace(/-/g, " ")
    .replace(/\bst\b/g, "sint")
    .replace(/\bsaint\b/g, "sint")
    .replace(/\bav\b/g, " ")
    .replace(/\bvzw\b/g, " ")
    .replace(/\bcampus\b/g, " ")
    .replace(/\bbloedbank(?:lab)?\b/g, " ")
    .replace(/\blaboratorium\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normaliseerBonnummer(raw) {
  const s = String(raw || "").replace(/\s+/g, "").trim();
  if (!s) return "";
  const m = s.match(IHCT_RE);
  if (!m) return s.slice(0, 32);
  return m[0].replace(/^[Iil1]H[cC][tT]/i, "IHcT");
}

export function extractBonCodesFromOcrText(text) {
  const raw = String(text || "");
  const found = [];
  const seen = new Set();
  const re = new RegExp(IHCT_RE.source, "gi");
  let m;
  while ((m = re.exec(raw)) !== null) {
    const code = normaliseerBonnummer(m[0]);
    const key = code.toUpperCase();
    if (!code || seen.has(key)) continue;
    seen.add(key);
    found.push(code);
  }
  return found;
}

function isoDatum(dag, maand, jaar) {
  let y = Number(jaar);
  const mo = Number(maand);
  const da = Number(dag);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(da)) return null;
  if (y < 100) y += 2000;
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || da < 1 || da > 31) return null;
  return `${y}-${pad2(mo)}-${pad2(da)}`;
}

function parseTijd(h, min) {
  const uur = Number(h);
  const m = Number(min);
  if (!Number.isFinite(uur) || uur < 0 || uur > 23 || !Number.isFinite(m) || m < 0 || m > 59) return null;
  return `${pad2(uur)}:${pad2(m)}`;
}

function eersteDatumTijd(s) {
  const raw = String(s || "");
  const samen = raw.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\s+(\d{1,2})[:.h](\d{2})/);
  if (samen) {
    const d = isoDatum(samen[1], samen[2], samen[3]);
    const ti = parseTijd(samen[4], samen[5]);
    if (d && ti) return { d, ti };
  }
  const dm = raw.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  const tm = raw.match(/(\d{1,2})[:.h](\d{2})/);
  return {
    d: dm ? isoDatum(dm[1], dm[2], dm[3]) : null,
    ti: tm ? parseTijd(tm[1], tm[2]) : null,
  };
}

function veldNaLabel(slice, labels) {
  const re = new RegExp(`(?:${labels.join("|")})\\s*[:.]?\\s*([^\\n\\r]+)`, "i");
  const m = String(slice || "").match(re);
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

function schoonPlaatsRegel(s) {
  return String(s || "")
    .replace(/^(org\.?|or\.|stp|stop|afd|adr|det|from|to)\s*[:.]?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function plaatsregelUitBlok(slice) {
  const skip = /^(pick|drop|adr|det|afd|extra|barcode|un\d|condition|verpak|omschrijv|lus\b)/i;
  const lines = String(slice || "")
    .split(/\r?\n/)
    .map(l => schoonPlaatsRegel(l))
    .filter(Boolean);
  for (const line of lines) {
    if (skip.test(line)) continue;
    if (/rkv|az |uz |zieken|kliniek|sint|\bst\.?\b|hospital|bloed/i.test(line)) return line;
  }
  return "";
}

function splitPickupDropoff(raw) {
  const text = String(raw || "");
  const drop = text.search(/\bdrop\s*off\b|\baflever/i);
  const pick = text.search(/\bpick\s*up\b|\bophal/i);
  if (drop >= 0) {
    return {
      kop: text.slice(0, pick >= 0 && pick < drop ? pick : drop),
      pickup: text.slice(pick >= 0 && pick < drop ? pick : 0, drop),
      dropoff: text.slice(drop),
    };
  }
  return {
    kop: pick >= 0 ? text.slice(0, pick) : "",
    pickup: pick >= 0 ? text.slice(pick) : text,
    dropoff: "",
  };
}

function schoonExtra(s) {
  const v = schoonPlaatsRegel(s);
  if (!v) return "";
  if (/^(barcode|pick\s*up|drop\s*off|org\.?|stop|afd|adr|det|un\d|lus\b)/i.test(v)) return "";
  return v;
}

function parseStopVelden(slice) {
  return {
    org: schoonPlaatsRegel(veldNaLabel(slice, ["org\\.?", "or\\.", "from"])),
    stop: schoonPlaatsRegel(veldNaLabel(slice, ["stop", "stp"])),
    afd: schoonPlaatsRegel(veldNaLabel(slice, ["afd", "afdeling"])),
    adr: schoonPlaatsRegel(veldNaLabel(slice, ["adr", "adres"])),
    det: schoonPlaatsRegel(veldNaLabel(slice, ["det", "detail"])),
  };
}

function compactStop(stop) {
  if (!stop) return null;
  const o = {};
  for (const k of ["org", "stop", "afd", "adr", "det"]) {
    const v = String(stop[k] || "").trim();
    if (v) o[k] = v;
  }
  return Object.keys(o).length ? o : null;
}

function compactInhoud(parsed) {
  if (!parsed) return null;
  const o = {};
  const set = (k, v) => {
    if (v == null || v === false || v === "") return;
    o[k] = v;
  };
  set("omschrijving", parsed.omschrijving);
  set("conditionering", parsed.conditionering);
  set("verpakking", parsed.verpakking);
  set("extra", parsed.extra);
  set("un3373", parsed.un3373);
  set("aankomstTijd", parsed.aankomstTijd);
  if (parsed.lus) o.lus = true;
  if (parsed.dringend) o.dringend = true;
  const pickup = compactStop(parsed.pickup);
  const dropoff = compactStop(parsed.dropoff);
  if (pickup) o.pickup = pickup;
  if (dropoff) o.dropoff = dropoff;
  const raw = String(parsed.raw || "").trim();
  if (raw) o.raw = raw.slice(0, 12_000);
  return Object.keys(o).length ? o : null;
}

function regelVanStop(stop) {
  if (!stop) return "";
  return [stop.stop, stop.afd, stop.adr, stop.det].filter(Boolean).join(" · ");
}

/** Compacte regels uit de bewaarde bon, voor op het scherm. */
export function bonInhoudRegels(inhoud) {
  if (!inhoud) return [];
  const rows = [];
  const add = (l, v) => {
    const s = typeof v === "string" ? v.trim() : v ? String(v) : "";
    if (s) rows.push({ l, v: s });
  };
  add("Omschrijving", inhoud.omschrijving);
  add("Conditionering", inhoud.conditionering);
  add("Verpakking", inhoud.verpakking);
  add("Extra", inhoud.extra);
  add("Ophalen", regelVanStop(inhoud.pickup));
  add("Afleveren", regelVanStop(inhoud.dropoff));
  add("Aankomst", inhoud.aankomstTijd);
  if (inhoud.lus) add("Lus", "Ja");
  if (inhoud.dringend) add("Dringend", "Ja");
  add("UN3373", inhoud.un3373);
  return rows;
}

/**
 * Meerdere IHcT-bons in één bestand (PDF met meerdere pagina’s) splitsen.
 * @param {string} text
 * @returns {string[]}
 */
export function splitBonStukken(text) {
  const raw = String(text || "").replace(/\u00a0/g, " ");
  if (!raw.trim()) return [];
  const re = new RegExp(IHCT_RE.source, "gi");
  const hits = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(raw)) !== null) {
    const code = normaliseerBonnummer(m[0]).toUpperCase();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    hits.push(m.index);
  }
  if (hits.length > 1) {
    return hits
      .map((start, i) => {
        const head = i === 0 && start > 0 ? raw.slice(0, start).trim() : "";
        const body = raw.slice(start, hits[i + 1]).trim();
        return [head, body].filter(Boolean).join("\n");
      })
      .filter(Boolean);
  }
  const picks = [...raw.matchAll(/\bPick\s*up\b/gi)];
  if (picks.length > 1) {
    return picks
      .map((p, i) => raw.slice(i === 0 ? 0 : p.index, picks[i + 1] ? picks[i + 1].index : raw.length).trim())
      .filter(Boolean);
  }
  return [raw.trim()];
}

/**
 * @param {string} text
 * @returns {{
 *   bon: string, vertrek: string, bestemming: string, datum: string|null,
 *   vertrekTijd: string|null, aankomstTijd: string|null,
 *   pickup: object, dropoff: object, omschrijving: string, conditionering: string,
 *   verpakking: string, extra: string, lus: boolean, un3373: string, dringend: boolean, raw: string
 * }}
 */
export function parseTransportBonText(text) {
  const raw = String(text || "").replace(/\u00a0/g, " ");
  const codes = extractBonCodesFromOcrText(raw);
  const { kop, pickup, dropoff } = splitPickupDropoff(raw);
  const pDt = eersteDatumTijd(pickup);
  const dDt = eersteDatumTijd(dropoff);
  const pStop = parseStopVelden(pickup);
  const dStop = parseStopVelden(dropoff);
  const orgLabelsVan = ["org\\.?", "or\\.", "from", "vertrek"];
  const orgLabelsNaar = ["org\\.?", "or\\.", "to", "bestemming", "destin"];
  const vertrek = schoonPlaatsRegel(
    pStop.org || veldNaLabel(pickup, orgLabelsVan) || plaatsregelUitBlok(pickup) || ""
  );
  const bestemming = schoonPlaatsRegel(
    dStop.org || veldNaLabel(dropoff, orgLabelsNaar) || plaatsregelUitBlok(dropoff) || ""
  );
  const unM = raw.match(/UN\s*3373[^\n\r]*/i);
  return {
    bon: codes[0] || "",
    vertrek,
    bestemming,
    datum: pDt.d || dDt.d,
    vertrekTijd: pDt.ti,
    aankomstTijd: dDt.ti,
    pickup: pStop,
    dropoff: dStop,
    omschrijving: schoonPlaatsRegel(veldNaLabel(kop || raw, ["omschrijving"])),
    conditionering: schoonPlaatsRegel(veldNaLabel(kop || raw, ["conditionering", "condition"])),
    verpakking: schoonPlaatsRegel(veldNaLabel(kop || raw, ["verpakking"])),
    extra: schoonExtra(veldNaLabel(raw, ["extra info"])),
    lus: /\blus\b/i.test(raw),
    un3373: unM ? unM[0].replace(/\s+/g, " ").trim() : "",
    dringend: /\bdrin(?:gent)?\b/i.test(raw),
    raw: raw.trim(),
  };
}

function plaatsCatalogus() {
  const byCanon = new Map();
  const zet = (name, lat, lng) => {
    const n = String(name || "").trim();
    if (!n) return;
    const key = canonPlaats(n);
    if (!key) return;
    const prev = byCanon.get(key);
    if (prev && prev.lat != null) return;
    byCanon.set(key, {
      name: n,
      lat: lat != null && Number.isFinite(Number(lat)) ? Number(lat) : null,
      lng: lng != null && Number.isFinite(Number(lng)) ? Number(lng) : null,
    });
  };
  for (const h of PRESET_ANCHOR_ZIEKENHUIZEN) zet(h.name, h.lat, h.lng);
  for (const r of ALL_PRESET_ROUTES) {
    zet(r.fromName);
    zet(r.toName);
  }
  return [...byCanon.values()];
}

function scorePlaats(query, name) {
  const a = canonPlaats(query);
  const b = canonPlaats(name);
  if (!a || !b) return 0;
  if (a === b) return 1000 + b.length;
  if (zelfdeCanon(a, b)) return 950 + b.length;
  if (b.startsWith(a) || a.startsWith(b)) return 800 + Math.min(a.length, b.length);
  if (b.includes(a) || a.includes(b)) return 600 + Math.min(a.length, b.length);
  const at = a.split(" ").filter(w => w.length > 1);
  const bt = new Set(b.split(" ").filter(w => w.length > 1));
  if (!at.length) return 0;
  let hit = 0;
  for (const t of at) {
    if (bt.has(t)) hit += 2;
    else if ([...bt].some(x => x.includes(t) || t.includes(x))) hit += 1;
  }
  const ratio = hit / (at.length * 2);
  if (ratio < 0.55) return 0;
  return Math.round(ratio * 400) + Math.min(b.length, 40);
}

export function matchPlaatsNaam(query, extra = []) {
  const q = String(query || "").trim();
  if (!q) return null;
  const qCanon = canonPlaats(q);
  const lijst = [...plaatsCatalogus(), ...extra.filter(x => x && x.name)];
  let best = null;
  let bestScore = 0;
  for (const p of lijst) {
    const c = canonPlaats(p.name);
    let s = scorePlaats(q, p.name);
    if (c.length >= 6 && qCanon.includes(c)) s = Math.max(s, 900 + c.length);
    if (s > bestScore) {
      bestScore = s;
      best = p;
    }
  }
  if (!best || bestScore < 200) return null;
  return { name: best.name, lat: best.lat ?? null, lng: best.lng ?? null, score: bestScore };
}

/** Zelfde plaats als de woorden omgewisseld zijn (AZ Diest ↔ Diest AZ, UZ Leuven ↔ Leuven UZ). */
function zelfdeCanon(a, b) {
  if (a === b) return true;
  const at = String(a || "")
    .split(" ")
    .filter(Boolean)
    .sort();
  const bt = String(b || "")
    .split(" ")
    .filter(Boolean)
    .sort();
  if (at.length < 2 || at.length !== bt.length) return false;
  return at.every((t, i) => t === bt[i]);
}

export function lookupRouteKm(fromName, toName, extraPairs = []) {
  const nf = canonPlaats(fromName);
  const nt = canonPlaats(toName);
  if (!nf || !nt) return null;
  const pairs = [
    ...ALL_PRESET_ROUTES.map(r => ({ f: r.fromName, t: r.toName, k: r.defaultKm })),
    ...extraPairs,
  ];
  for (const p of pairs) {
    const a = canonPlaats(p.f);
    const b = canonPlaats(p.t);
    const zelfde =
      (zelfdeCanon(a, nf) && zelfdeCanon(b, nt)) || (zelfdeCanon(a, nt) && zelfdeCanon(b, nf));
    if (!zelfde) continue;
    const k = Math.round(Number(p.k));
    if (Number.isFinite(k) && k >= 1) return k;
  }
  return null;
}

function statusVoor(iso, ti) {
  if (!iso) return "komend";
  const [y, m, d] = iso.split("-").map(Number);
  const [hh, mm] = String(ti || "00:00").split(":").map(Number);
  const when = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0);
  return when.getTime() < Date.now() - 20 * 60 * 1000 ? "voltooid" : "komend";
}

/**
 * @param {string} text
 * @param {{ extraPlaatsen?: Array<{name:string,lat?:number,lng?:number}>, extraKm?: Array<{f:string,t:string,k:number}> }} [opts]
 */
export async function voorstelUitBonTekst(text, opts = {}) {
  const parsed = parseTransportBonText(text);
  const extraPlaatsen = opts.extraPlaatsen || [];
  const extraKm = opts.extraKm || [];
  let van = matchPlaatsNaam(parsed.vertrek, extraPlaatsen);
  let naar = matchPlaatsNaam(parsed.bestemming, extraPlaatsen);
  if (!van || !naar) {
    const { pickup, dropoff } = splitPickupDropoff(text);
    if (!van) van = matchPlaatsNaam(pickup, extraPlaatsen) || matchPlaatsNaam(text, extraPlaatsen);
    if (!naar) naar = matchPlaatsNaam(dropoff, extraPlaatsen);
  }
  const f = van?.name || parsed.vertrek || "";
  const t = naar?.name || parsed.bestemming || "";
  let k = lookupRouteKm(f, t, extraKm);
  let kmBron = k ? "lijst" : "";
  if (!k && van?.lat != null && naar?.lat != null && van.lng != null && naar.lng != null) {
    try {
      const r = await getDrivingRouteKm({ lat: van.lat, lng: van.lng }, { lat: naar.lat, lng: naar.lng });
      if (r?.km >= 1) {
        k = Math.max(1, Math.round(r.km));
        kmBron = "weg";
      }
    } catch {
      /* gebruiker vult km zelf in */
    }
  }
  const ti = parsed.vertrekTijd || "";
  const d = parsed.datum;
  const kInt = k && k >= 1 ? k : null;
  const v = kInt ? Math.round(vergoedingVoorRit(kInt, ti, { fromName: f, toName: t }) * 100) / 100 : 0;
  const inhoud = compactInhoud(parsed);
  return {
    bon: parsed.bon,
    f,
    t,
    d: d || "",
    ti,
    k: kInt,
    v,
    kmBron,
    nacht: isNachtTariefTijd(ti),
    s: statusVoor(d, ti),
    coords:
      van?.lat != null && naar?.lat != null
        ? { a: { lat: van.lat, lng: van.lng }, b: { lat: naar.lat, lng: naar.lng } }
        : null,
    inhoud,
  };
}

export function tripUitVoorstel(voorstel, { id, chauffeur, voertuig, bestandId }) {
  const kInt = Math.max(1, Math.round(Number(voorstel.k) || 0));
  const f = String(voorstel.f || "").trim();
  const t = String(voorstel.t || "").trim();
  const ti = String(voorstel.ti || "").trim();
  const d = String(voorstel.d || "").slice(0, 10);
  const v = Math.round(vergoedingVoorRit(kInt, ti, { fromName: f, toName: t }) * 100) / 100;
  const trip = {
    id,
    d,
    ti,
    f,
    t,
    k: kInt,
    dr: chauffeur,
    ca: voertuig,
    s: voorstel.s === "komend" ? "komend" : "voltooid",
    v,
  };
  const bon = String(voorstel.bon || "").trim();
  if (bon) trip.bon = bon;
  const inhoud = voorstel.inhoud || null;
  if (inhoud && Object.keys(inhoud).length) trip.bonInhoud = inhoud;
  const bid = String(bestandId || voorstel.bestandId || "").trim();
  if (bid) trip.bonBestandId = bid;
  return trip;
}

export function voorstelIsKlaar(v) {
  return !!(
    v &&
    String(v.f || "").trim() &&
    String(v.t || "").trim() &&
    /^\d{4}-\d{2}-\d{2}$/.test(String(v.d || "")) &&
    Number(v.k) >= 1
  );
}
