import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./transportme-theme.css";
import { exportTransporteurData, applyImportPayload } from "./js/dataBackup.js";
import { recognizeBonImage, terminateBonOcrWorker } from "./js/bonFotoOcr.js";
import { getFactuurGegevens, nextFactuurVolgNummer, saveFactuurGegevens } from "./js/storage.js";
import { generateFactuurPdfBlob, triggerPdfDownload } from "./js/invoicePdf.js";
import { downloadRittenExcel, leesRittenExcel, voegExcelRittenToe, meldingExcelInlees } from "./js/rittenExcel.js";
import { vergoedingVoorRit, vergoedingUitsplitsingVoorRit } from "./js/calculations.js";
import { getDrivingRouteKm, getDrivingRouteWithGeometry } from "./js/ors.js";
import { createGoogleRouteMap } from "./js/googleMapsView.js";
import { searchPlacesBelgium } from "./js/placeSearchFree.js";
import { PRESET_ANCHOR_ZIEKENHUIZEN, ALL_PRESET_ROUTES, hasGoogleMapsApiKey } from "./js/config.js";
import ziekenVlaanderen from "./data/ziekenhuizen-vlaanderen.json";

/** Kaartkleur van de route-lijn — zelfde basis als --acc in transportme-theme.css */
const TM_ACC = "#2F5BEA";

const PR = [{ id: "houdaifa", n: "Houdaifa", i: "H" }];
const DR = ["Houdaifa", "Student 1"],
  CA = ["Audi A3 (2-HKN-136)", "BMW Serie 1 (2-GGW-635)"];

function tmRoutesFromPresets(presets) {
  const byId = Object.fromEntries(PRESET_ANCHOR_ZIEKENHUIZEN.map(h => [h.id, h]));
  return presets
    .map(p => {
      const a = byId[p.fromId];
      const b = byId[p.toId];
      if (!a || !b) return null;
      return {
        f: p.fromName,
        t: p.toName,
        k: p.defaultKm,
        la1: a.lat,
        lo1: a.lng,
        la2: b.lat,
        lo2: b.lng,
        __potentieel: p.potentieel === true,
      };
    })
    .filter(Boolean);
}
const ROUTES = tmRoutesFromPresets(ALL_PRESET_ROUTES);

const nt = () => {
  const d = new Date();
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
};
const ui = () => Date.now() + "" + Math.random().toString(36).slice(2, 5);
const isN = t => {
  if (!t) return false;
  const h = +String(t).split(":")[0];
  return h >= 20 || h < 5;
};

/** Zelfde regels als klassieke app (forfait Sango/RKV Mechelen ↔ UZA; nacht +30% op aantal schijven). */
function tmVergoeding(f, t, k, ti) {
  const kk = Number(k) || 0;
  return vergoedingVoorRit(kk, ti || "", { fromName: f, toName: t });
}

/** Lokale lijst: Vlaamse ziekenhuizen (OSM) + vaste ankertjes met coördinaten. */
const TM_ZIEKENHUIZEN_LIJST = (() => {
  const by = new Map();
  for (const h of ziekenVlaanderen) {
    const name = String(h.name || "").trim();
    if (!name) continue;
    by.set(name.toLowerCase(), { name, address: String(h.address || "").trim(), lat: h.lat, lng: h.lng });
  }
  for (const a of PRESET_ANCHOR_ZIEKENHUIZEN) {
    const name = String(a.name || "").trim();
    if (!name || by.has(name.toLowerCase())) continue;
    by.set(name.toLowerCase(), {
      name,
      address: String(a.address || name).trim(),
      lat: a.lat,
      lng: a.lng,
    });
  }
  return [...by.values()].sort((x, y) => x.name.localeCompare(y.name, "nl"));
})();

/** Unieke sleutel voor een vaste route (dedupe archief / actieve lijst). */
function tmRouteKey(r) {
  return `${String(r.f || "")
    .toLowerCase()
    .trim()}\t${String(r.t || "")
    .toLowerCase()
    .trim()}\t${Number(r.k)}`;
}

function tmNormRouteName(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[()[\]{}]/g, " ")
    .replace(/\s*\/\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tmLookupHospitalByName(name) {
  const n = tmNormRouteName(name);
  if (!n) return null;
  let best = null;
  let bestLen = 0;
  for (const h of TM_ZIEKENHUIZEN_LIJST) {
    const hn = tmNormRouteName(h.name);
    if (!hn || h.lat == null || h.lng == null) continue;
    if (hn === n) return { lat: h.lat, lng: h.lng };
    if (n.includes(hn) || hn.includes(n)) {
      if (hn.length > bestLen) {
        best = h;
        bestLen = hn.length;
      }
    }
  }
  return best ? { lat: best.lat, lng: best.lng } : null;
}

function tmResolveRitRouteCoords(f, t, mergedRows) {
  const nf = tmNormRouteName(f);
  const nt = tmNormRouteName(t);
  for (const row of mergedRows) {
    if (!row.__map) continue;
    const rf = tmNormRouteName(row.f);
    const rt = tmNormRouteName(row.t);
    if (rf === nf && rt === nt && row.la1 != null && row.la2 != null)
      return { a: { lat: row.la1, lng: row.lo1 }, b: { lat: row.la2, lng: row.lo2 } };
    if (rf === nt && rt === nf && row.la1 != null && row.la2 != null)
      return { a: { lat: row.la2, lng: row.lo2 }, b: { lat: row.la1, lng: row.lo1 } };
  }
  const a = tmLookupHospitalByName(f);
  const b = tmLookupHospitalByName(t);
  if (a && b) return { a, b };
  return null;
}

/** Zelfde samenvoeging als Ritten → vaste routes (voor km-herberekening). */
function tmBuildMergedRoutes(D) {
  const built = ROUTES.map(r => ({ ...r, __map: true }));
  const custom = (D.xr || []).map(r => {
    const hasMap =
      r.la1 != null && r.lo1 != null && r.la2 != null && r.lo2 != null && Number.isFinite(Number(r.la1));
    return {
      f: r.f,
      t: r.t,
      k: r.k,
      la1: r.la1,
      lo1: r.lo1,
      la2: r.la2,
      lo2: r.lo2,
      __map: hasMap,
      __id: r.id,
    };
  });
  const activeKeys = new Set((D.xr || []).map(tmRouteKey));
  const arch = (D.xrArch || [])
    .filter(r => !activeKeys.has(tmRouteKey(r)))
    .map(r => {
      const hasMap =
        r.la1 != null && r.lo1 != null && r.la2 != null && r.lo2 != null && Number.isFinite(Number(r.la1));
      return {
        f: r.f,
        t: r.t,
        k: r.k,
        la1: r.la1,
        lo1: r.lo1,
        la2: r.la2,
        lo2: r.lo2,
        __map: hasMap,
        __arch: true,
        id: r.id,
      };
    });
  return [...built, ...custom, ...arch];
}

/** Ziekenhuizenlijst + eindpunten uit verwijderde eigen routes (Meer → archief). */
function ziekenLijstMetArchief(baseLijst, xrArch) {
  const seen = new Set(baseLijst.map(h => String(h.name || "").toLowerCase()));
  const extra = [];
  for (const r of xrArch || []) {
    const ends = [
      { n: r.f, la: r.la1, lo: r.lo1 },
      { n: r.t, la: r.la2, lo: r.lo2 },
    ];
    for (const { n, la, lo } of ends) {
      const name = String(n || "").trim();
      const k = name.toLowerCase();
      if (!name || seen.has(k)) continue;
      seen.add(k);
      const lat = la != null && Number.isFinite(Number(la)) ? Number(la) : undefined;
      const lng = lo != null && Number.isFinite(Number(lo)) ? Number(lo) : undefined;
      extra.push({ name, address: "", lat, lng });
    }
  }
  extra.sort((a, b) => a.name.localeCompare(b.name, "nl"));
  return [...baseLijst, ...extra];
}

/** Kalenderdatum in lokale tijd (geen UTC-shift zoals toISOString → foutieve maand/week in EU). */
function toIsoLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Alle kalenderdagen van isoStart t/m isoEnd (YYYY-MM-DD), inclusief. */
function eachDayInclusive(isoStart, isoEnd) {
  const out = [];
  const a = isoStart.slice(0, 10);
  const b = isoEnd.slice(0, 10);
  if (a > b) return out;
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  let cur = new Date(y1, m1 - 1, d1);
  cur.setHours(12, 0, 0, 0);
  const end = new Date(y2, m2 - 1, d2);
  end.setHours(12, 0, 0, 0);
  while (cur <= end) {
    out.push(toIsoLocal(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}
const td = () => toIsoLocal(new Date());
const yd = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toIsoLocal(d);
};
const wk = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const y = d.getDay();
  d.setDate(d.getDate() - (y === 0 ? 6 : y - 1));
  const start = new Date(d);
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  return [toIsoLocal(start), toIsoLocal(end)];
};
const mo = () => {
  const d = new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return [toIsoLocal(start), toIsoLocal(end)];
};
const iR = (d, s, e) => d >= s && d <= e;

/** Factuur-/export: geldige YYYY-MM-DD range; anders fallback (dashboard-periode). */
function normFactuurDatumRange(van, tot, fallbackStart, fallbackEnd) {
  const a = typeof van === "string" ? van.slice(0, 10) : "";
  const b = typeof tot === "string" ? tot.slice(0, 10) : "";
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(a) && /^\d{4}-\d{2}-\d{2}$/.test(b);
  if (!ok) {
    const fs = String(fallbackStart || "").slice(0, 10);
    const fe = String(fallbackEnd || "").slice(0, 10);
    return fs <= fe ? [fs, fe] : [fe, fs];
  }
  return a <= b ? [a, b] : [b, a];
}
/** Totalen op Home/Financieel: geen stilzwijgend afsnijden per datum. */
const statsVenster = () => true;
const gr = p => {
  if (p === "day") return [td(), td()];
  if (p === "yesterday") return [yd(), yd()];
  if (p === "week") return wk();
  return mo();
};
function ritDatumBereik(ritten) {
  const ds = (ritten || [])
    .map(r => String(r.d || "").slice(0, 10))
    .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  if (!ds.length) return [td(), td()];
  return [ds[0], ds[ds.length - 1]];
}
const grExt = (p, ritten) => (p === "all" ? ritDatumBereik(ritten) : gr(p));

/** Korte datum voor Home-overzicht (nl-BE). */
function fmtNlShort(iso) {
  if (!iso || iso.length < 10) return iso || "";
  const y = +iso.slice(0, 4);
  const m = +iso.slice(5, 7) - 1;
  const d = +iso.slice(8, 10);
  const dt = new Date(y, m, d);
  return dt.toLocaleDateString("nl-BE", { day: "numeric", month: "short" });
}

/** Volledige datum vandaag voor Home (altijd dagoverzicht). */
function fmtNlVandaagLong() {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d.toLocaleDateString("nl-BE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function fmtNlLongFromIso(iso) {
  if (!iso || iso.length < 10) return iso || "";
  const y = +iso.slice(0, 4);
  const m = +iso.slice(5, 7) - 1;
  const d = +iso.slice(8, 10);
  const dt = new Date(y, m, d);
  dt.setHours(12, 0, 0, 0);
  return dt.toLocaleDateString("nl-BE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function parseXrLikeRow(it, idx, idPrefix) {
  if (!it || typeof it !== "object") return null;
  const f = String(it.f || "").trim();
  const tt = String(it.t || "").trim();
  const k = Number(it.k);
  if (!f || !tt || !Number.isFinite(k) || k < 1) return null;
  const id = it.id != null && String(it.id).trim() ? String(it.id).trim() : `${idPrefix}-${idx}-${k}`;
  const out = { id, f, t: tt, k };
  const num = n => (n != null && Number.isFinite(Number(n)) ? Number(n) : null);
  const la1 = num(it.la1),
    lo1 = num(it.lo1),
    la2 = num(it.la2),
    lo2 = num(it.lo2);
  if (la1 != null && lo1 != null && la2 != null && lo2 != null) {
    out.la1 = la1;
    out.lo1 = lo1;
    out.la2 = la2;
    out.lo2 = lo2;
  }
  return out;
}

function normData(x) {
  const o = x && typeof x === "object" ? x : {};
  const xrRaw = Array.isArray(o.xr) ? o.xr : [];
  const xr = xrRaw.map((it, idx) => parseXrLikeRow(it, idx, "xr")).filter(Boolean);
  const xrArchRaw = Array.isArray(o.xrArch) ? o.xrArch : [];
  const xrArch = xrArchRaw.map((it, idx) => parseXrLikeRow(it, idx, "xra")).filter(Boolean).slice(0, 40);
  return { r: o.r || [], b: o.b || [], o: o.o || [], xr, xrArch };
}

/** Zelfde keys als src/js/config.js STORAGE_KEYS — data van de klassieke Transporteur-app op het toestel. */
const LS_RITTEN = "transporteur_ritten";
const LS_BRANDSTOF = "transporteur_brandstof";
const LS_OVERIG = "transporteur_overig";
const LS_LEGACY_PROFILE = "transporteur_current_profile";

function safeParseJsonArray(raw) {
  try {
    const x = JSON.parse(raw || "[]");
    return Array.isArray(x) ? x : [];
  } catch {
    return [];
  }
}

function padTijd(t) {
  if (t == null || typeof t !== "string") return "";
  const m = String(t).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "";
  const h = Number(m[1]);
  if (!Number.isFinite(h) || h < 0 || h > 23) return "";
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/**
 * Oude/geplakte getallen: 1.234,56 (BE), 1,234.56 (US), 1.234 (duizend) vs 90.5 (decimalen).
 * Bij alleen punten: decimalen enkel als er precies één punt is en ≤2 cijfers erna; anders duizendtallen.
 */
function parseLooseNumber(val) {
  if (val == null || val === "") return NaN;
  if (typeof val === "number" && Number.isFinite(val)) return val;
  const s0 = String(val).trim().replace(/\s/g, "");
  const lastComma = s0.lastIndexOf(",");
  const lastDot = s0.lastIndexOf(".");
  let s = s0;
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) s = s0.replace(/\./g, "").replace(",", ".");
    else s = s0.replace(/,/g, "");
  } else if (lastComma > -1) {
    s = s0.replace(",", ".");
  } else if (lastDot > -1) {
    const parts = s0.split(".");
    if (parts.length === 2 && parts[1].length <= 2) s = s0;
    else s = s0.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** Veilige euro voor totalen (geen NaN door corrupte strings). */
function money(x) {
  if (x == null || x === "") return 0;
  if (typeof x === "number") return Number.isFinite(x) ? x : 0;
  const n = parseLooseNumber(x);
  return Number.isFinite(n) ? n : 0;
}

/** Som van rit-km: per rit altijd `(Number(k)||0)` i.v.m. `acc + Number(k)||0` (NaN reset de som). */
function ritKmValue(r) {
  const k = Number(r?.k);
  return Number.isFinite(k) && k > 0 ? k : 0;
}

function E(n) {
  const x = money(n);
  return "€" + x.toFixed(2).replace(".", ",");
}

function isTmStoreLeeg(data) {
  const n = normData(data);
  return n.r.length === 0 && n.b.length === 0 && (n.o || []).length === 0;
}

function legacyRitToTm(r) {
  if (!r || typeof r !== "object") return null;
  const d = (r.d || r.datum || "").toString();
  const d10 = d.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d10)) return null;
  const k = Number(r.k != null ? r.k : r.km);
  if (!Number.isFinite(k) || k < 1) return null;
  const ti = padTijd(r.ti ?? r.tijd ?? "");
  let s = r.s ?? r.status;
  if (!["komend", "lopend", "voltooid", "geannuleerd"].includes(s)) s = "voltooid";
  const f = (r.f || r.fromName || "").toString().trim() || "—";
  const t = (r.t || r.toName || "").toString().trim() || "—";
  let v = parseLooseNumber(r.v != null ? r.v : r.vergoeding);
  if (!Number.isFinite(v)) v = tmVergoeding(f, t, k, ti);
  const id = r.id != null && r.id !== "" ? String(r.id) : ui();
  const dr = (r.dr || r.chauffeurName || DR[0]).toString();
  const ca = (r.ca || r.voertuigName || CA[0]).toString();
  const out = { id, d: d10, ti, f, t, k, dr, ca, s, v };
  const bon = (r.bon ?? r.bonnummer ?? "").toString().trim();
  if (bon) out.bon = bon;
  ["pr", "pc", "tel", "wc", "deur", "bag", "nt"].forEach(key => {
    if (r[key] != null && r[key] !== "") out[key] = r[key];
  });
  return out;
}

function legacyBrandstofToTm(x) {
  if (!x || typeof x !== "object") return null;
  const d = (x.d || x.datum || "").toString();
  const d10 = d.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d10)) return null;
  const l = parseLooseNumber(x.l != null ? x.l : x.liter);
  const p = parseLooseNumber(x.p != null ? x.p : x.prijs);
  if (!Number.isFinite(l) || l <= 0 || !Number.isFinite(p) || p < 0) return null;
  const id = x.id != null && x.id !== "" ? String(x.id) : ui();
  const aDirect = parseLooseNumber(x.a);
  const a = Number.isFinite(aDirect) ? aDirect : Math.round(l * p * 100) / 100;
  return { id, d: d10, l, p, a };
}

function legacyOverigToTm(x) {
  if (!x || typeof x !== "object") return null;
  const d = (x.d || x.datum || "").toString();
  const d10 = d.slice(0, 10);
  const a = parseLooseNumber(x.a != null ? x.a : x.bedrag);
  const desc = (x.desc || x.omschrijving || "").toString().trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d10) || !Number.isFinite(a) || a < 0) return null;
  const id = x.id != null && x.id !== "" ? String(x.id) : ui();
  return { id, d: d10, a, desc };
}

function leesLegacyBundel(profileId) {
  const r = safeParseJsonArray(localStorage.getItem(`${LS_RITTEN}_${profileId}`))
    .map(legacyRitToTm)
    .filter(Boolean);
  const b = safeParseJsonArray(localStorage.getItem(`${LS_BRANDSTOF}_${profileId}`))
    .map(legacyBrandstofToTm)
    .filter(Boolean);
  const o = safeParseJsonArray(localStorage.getItem(`${LS_OVERIG}_${profileId}`))
    .map(legacyOverigToTm)
    .filter(Boolean);
  return { r, b, o };
}

/** Ophogen = éénmalig alle ritten opnieuw aligneren (km + € volgens tarief), behalve handmatigKv. */
const TM_AUTO_FIX_CALC_VERSION = "tm_auto_fix_calc_v3";
const tmCalcFixKey = profileId => `tm_calc_fix_done_${TM_AUTO_FIX_CALC_VERSION}_${profileId}`;

function tmBuildRouteKmLookup(data) {
  const m = new Map();
  const add = (f, t, k) => {
    const km = Number(k);
    if (!Number.isFinite(km) || km < 1) return;
    const nf = tmNormRouteName(f);
    const nt = tmNormRouteName(t);
    if (!nf || !nt) return;
    m.set(`${nf}\t${nt}`, Math.max(1, Math.round(km)));
  };
  ROUTES.forEach(r => add(r.f, r.t, r.k));
  (data.xr || []).forEach(r => add(r.f, r.t, r.k));
  const active = new Set((data.xr || []).map(tmRouteKey));
  (data.xrArch || []).filter(r => !active.has(tmRouteKey(r))).forEach(r => add(r.f, r.t, r.k));
  return m;
}

/**
 * Corrigeert automatisch foutieve ritbedragen: zelfde km behouden (meting/gebruiker),
 * vergoeding opnieuw met actuele regels + betere route-naamherkenning.
 * Alleen als km ontbreekt/ongeldig: vul met bekende preset-km indien beschikbaar.
 */
function autoFixRitBerekeningen(data) {
  const routeKm = tmBuildRouteKmLookup(data);
  let changed = false;
  const rides = (data.r || []).map(r => {
    if (!r || typeof r !== "object") return r;
    if (r.handmatigKv) return r;
    const nf = tmNormRouteName(r.f);
    const nt = tmNormRouteName(r.t);
    const routeKey = `${nf}\t${nt}`;
    const revKey = `${nt}\t${nf}`;
    const knownKm = routeKm.get(routeKey) ?? routeKm.get(revKey);
    let baseKm = Number(r.k);
    if (!Number.isFinite(baseKm) || baseKm < 1) {
      if (knownKm == null) return r;
      baseKm = knownKm;
      changed = true;
    }
    const nextKm = Math.max(1, Math.round(baseKm));
    const nextV = Math.round(vergoedingVoorRit(nextKm, r.ti || "", { fromName: r.f, toName: r.t }) * 100) / 100;
    const curK = Math.max(1, Math.round(Number(r.k) || 0));
    const curV = Math.round(money(r.v) * 100) / 100;
    if (nextKm === curK && nextV === curV) return r;
    changed = true;
    return { ...r, k: nextKm, v: nextV };
  });
  return changed ? normData({ ...data, r: rides }) : data;
}

function autoApplyCalcFix(profileId, data) {
  try {
    if (localStorage.getItem(tmCalcFixKey(profileId)) === "1") return data;
  } catch {
    /* ignore */
  }
  const fixed = autoFixRitBerekeningen(data);
  try {
    if (fixed !== data) localStorage.setItem("t_" + profileId, JSON.stringify(fixed));
    localStorage.setItem(tmCalcFixKey(profileId), "1");
  } catch {
    /* ignore quota */
  }
  return fixed;
}

/** Laadt TransportMe-bundel `t_<profiel>`; als die leeg is, éénmalig importeren uit legacy localStorage. */
const ld = p => {
  let data;
  try {
    data = normData(JSON.parse(localStorage.getItem("t_" + p) || "null"));
  } catch {
    data = normData(null);
  }
  if (isTmStoreLeeg(data)) {
    const leg = leesLegacyBundel(p);
    if (leg.r.length > 0 || leg.b.length > 0 || leg.o.length > 0) {
      const merged = normData({ ...leg, xr: data.xr, xrArch: data.xrArch || [] });
      try {
        localStorage.setItem("t_" + p, JSON.stringify(merged));
      } catch {
        /* quota */
      }
      return autoApplyCalcFix(p, merged);
    }
  }
  return autoApplyCalcFix(p, data);
};

const sv = (p, d) => localStorage.setItem("t_" + p, JSON.stringify(d));

/**
 * Start (go) / voltooien (ok). Annuleren (no) of ✕ (x): rit wordt verwijderd — geen status “geannuleerd”, telt nergens mee.
 * Bij ok: optioneel `opts.bon` — als meegegeven (ook lege string), bon overschrijven/wissen.
 */
function applyTripAction(rides, id, a, opts) {
  const i = rides.findIndex(x => x.id === id);
  if (i < 0) return rides;
  const rr = [...rides];
  if (a === "go") rr[i] = { ...rr[i], s: "lopend" };
  else if (a === "ok") {
    const cur = rr[i];
    let next = { ...cur, s: "voltooid" };
    if (opts && Object.prototype.hasOwnProperty.call(opts, "bon")) {
      const t = String(opts.bon ?? "").trim();
      if (t) next.bon = t;
      else delete next.bon;
    }
    /** Zorg dat opgeslagen € gelijk blijft aan tarief × km (tenzij handmatige km/€). */
    if (!next.handmatigKv) {
      const kInt = Math.max(1, Math.round(Number(next.k) || 0));
      next.k = kInt;
      next.v = Math.round(tmVergoeding(next.f, next.t, kInt, next.ti || "") * 100) / 100;
    }
    rr[i] = next;
  } else rr.splice(i, 1);
  return rr;
}

/** Bon uit barcode (IHcT…) of ruwe tekst. */
function normBonFromScan(text) {
  const s = String(text || "").trim();
  const m = s.match(/IHcT[A-Za-z0-9]+/i);
  return (m ? m[0] : s).slice(0, 48);
}

/** Meerdere transportbonnen: komma, puntkomma, slash, pijp of regeleinde. */
function parseBonNummers(bon) {
  const raw = bon != null ? String(bon).trim() : "";
  if (!raw) return [];
  return raw
    .split(/[,;/|\n\r]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

/** Voegt OCR-bonnen toe aan bestaande bon-tekst (geen duplicaten). */
function mergeBonField(existing, newCodes) {
  const tokens = parseBonNummers(existing);
  const seen = new Set(tokens.map(t => t.toUpperCase()));
  const add = [];
  for (const c of newCodes) {
    const n = normBonFromScan(c);
    if (!n || seen.has(n.toUpperCase())) continue;
    seen.add(n.toUpperCase());
    add.push(n);
  }
  if (add.length === 0) return String(existing || "").trim();
  return [...tokens, ...add].join(", ");
}

/** Verdeel een ritbedrag over n factuurregels (centen correct op de laatste lijn). */
function splitBedragInLijnen(totaalEuro, n) {
  if (n <= 0) return [];
  const cents = Math.round(money(totaalEuro) * 100);
  if (!Number.isFinite(cents)) return Array(n).fill(0);
  if (cents <= 0) return Array(n).fill(0);
  const base = Math.floor(cents / n);
  const rest = cents - base * n;
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = base + (i === n - 1 ? rest : 0);
    out.push(c / 100);
  }
  return out;
}

/** Voltooien: bon typen of scannen (lopend/komend → voltooid). */
function VoltooiBonSheet({ rit, onBevestig, onAnnuleer }) {
  const [bon, setBon] = useState(() => (rit?.bon != null ? String(rit.bon) : ""));
  const [scan, setScan] = useState(false);
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const readerRef = useRef(null);

  useEffect(() => {
    setBon(rit?.bon != null ? String(rit.bon) : "");
  }, [rit?.id, rit?.bon]);

  const stopScan = useCallback(() => {
    try {
      controlsRef.current?.stop();
    } catch {
      /* ignore */
    }
    controlsRef.current = null;
    readerRef.current = null;
    setScan(false);
  }, []);

  useEffect(() => () => stopScan(), [stopScan]);

  const startScan = async () => {
    if (scan) {
      stopScan();
      return;
    }
    setScan(true);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;
      const v = videoRef.current;
      if (!v) {
        setScan(false);
        return;
      }
      const controls = await reader.decodeFromVideoDevice(undefined, v, (res, err) => {
        if (res) {
          const t = normBonFromScan(res.getText());
          if (t) setBon(t);
          stopScan();
        }
      });
      controlsRef.current = controls;
    } catch (e) {
      console.error(e);
      setScan(false);
      alert("Camera niet beschikbaar of geen toestemming.");
    }
  };

  if (!rit) return null;

  return (
    <div className="tm-ov tm-ov--bon" onClick={e => e.target === e.currentTarget && onAnnuleer()}>
      <div className="tm-mo tm-mo--bon" onClick={e => e.stopPropagation()}>
        <div className="tm-mh">
          <h2>Rit voltooien</h2>
          <button type="button" className="btn btn-gh" onClick={onAnnuleer} aria-label="Sluiten">
            ✕
          </button>
        </div>
        <div className="tm-mb">
          <p className="tm-card-p">
            {rit.f} naar {rit.t}, {rit.k} km.
          </p>
          <div className="tm-fg">
            <label className="fl">Bonnummer</label>
            <input
              type="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Optioneel"
              value={bon}
              onChange={e => setBon(e.target.value)}
            />
            <p style={{ fontSize: 11, color: "var(--tx3)", margin: "6px 0 0", lineHeight: 1.35 }}>
              Meerdere bonnen? Scheid ze met een komma. Op de factuur komt dan één regel per bon.
            </p>
          </div>
          <div className="tm-bon-scan-row">
            <button type="button" className="btn btn-o btn-full" onClick={startScan}>
              {scan ? "Scan stoppen" : "Barcode scannen"}
            </button>
          </div>
          {scan ? (
            <div className="tm-bon-video-wrap">
              <video ref={videoRef} className="tm-bon-video" playsInline muted />
            </div>
          ) : null}
          <div className="tm-mfa tm-mfa-single">
            <button type="button" className="btn btn-p btn-full" onClick={() => onBevestig(bon.trim())}>
              Rit voltooien
            </button>
            <button type="button" className="btn btn-gh btn-full" onClick={onAnnuleer}>
              Terug
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function initialProfileId() {
  try {
    const tp = localStorage.getItem("tp");
    const cur = localStorage.getItem(LS_LEGACY_PROFILE);
    const ok = id => PR.some(x => x.id === id);
    if (ok(tp)) return tp;
    if (ok(cur)) {
      try {
        localStorage.setItem("tp", cur);
      } catch {
        /* ignore */
      }
      return cur;
    }
  } catch {
    /* private mode / blocked storage */
  }
  return "houdaifa";
}

function Badge({ s }) {
  const m = {
    komend: ["Gepland", "b-k"],
    lopend: ["Onderweg", "b-l"],
    voltooid: ["Voltooid", "b-v"],
    geannuleerd: ["Geannuleerd", "b-g"],
  };
  const [l, c] = m[s] || m.voltooid;
  return <span className={"badge " + c}>{l}</span>;
}

function useDebouncedValue(v, ms) {
  const [x, setX] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setX(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return x;
}

/** Ziekenhuizen (Vlaanderen + ankertjes) + optioneel zoeken heel België via OSM. */
function PlaatsPicker({ label, gekozen, onKies, lijst }) {
  const [q, setQ] = useState(gekozen?.name || "");
  const [remote, setRemote] = useState([]);
  const [busy, setBusy] = useState(false);
  const qDeb = useDebouncedValue(q.trim(), 1000);

  useEffect(() => {
    setQ(gekozen?.name || "");
  }, [gekozen?.name]);

  useEffect(() => {
    let cancel = false;
    if (qDeb.length < 3) {
      setRemote([]);
      return;
    }
    (async () => {
      setBusy(true);
      try {
        const r = await searchPlacesBelgium(qDeb);
        if (!cancel) setRemote(Array.isArray(r) ? r : []);
      } catch {
        if (!cancel) setRemote([]);
      } finally {
        if (!cancel) setBusy(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [qDeb]);

  const localHits = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return [];
    return lijst
      .filter(h => h.name.toLowerCase().includes(qq) || (h.address || "").toLowerCase().includes(qq))
      .slice(0, 30);
  }, [q, lijst]);

  const kies = p => {
    onKies(p);
    setQ(p.name);
    setRemote([]);
  };

  const showHits = q.trim().length > 0 && (localHits.length > 0 || remote.length > 0 || busy);

  return (
    <div className="tm-fg">
      <label className="fl">{label}</label>
      <input
        type="text"
        value={q}
        placeholder="Zoek ziekenhuis of adres (België)…"
        autoComplete="off"
        onChange={e => setQ(e.target.value)}
      />
      {gekozen?.name && (
        <div style={{ fontSize: 11, color: "var(--acc)", marginTop: 4 }}>
          Gekozen: {gekozen.name}
          {gekozen.lat != null ? " · coördinaten OK" : ""}
        </div>
      )}
      {showHits && (
        <div
          className="tm-prs"
          style={{ maxHeight: 160, marginTop: 6, border: "1px solid var(--bd)", borderRadius: 8, padding: 6 }}
        >
          {localHits.map(h => (
            <button
              key={h.name + (h.address || "")}
              type="button"
              className="tm-pr"
              style={{ marginBottom: 4 }}
              onClick={() => kies({ name: h.name, lat: h.lat, lng: h.lng, address: h.address })}
            >
              <span>{h.name}</span>
              <span className="tm-pk" style={{ maxWidth: "45%", textAlign: "right" }}>
                {(h.address || "").slice(0, 36)}
                {(h.address || "").length > 36 ? "…" : ""}
              </span>
            </button>
          ))}
          {localHits.length > 0 && remote.length > 0 && (
            <div style={{ fontSize: 10, color: "var(--tx3)", padding: "4px 0" }}>— ook in heel België —</div>
          )}
          {busy && qDeb.length >= 3 && <div style={{ fontSize: 11, color: "var(--tx3)", padding: 6 }}>Zoeken…</div>}
          {remote.map((h, i) => (
            <button key={i} type="button" className="tm-pr" style={{ marginBottom: 4 }} onClick={() => kies(h)}>
              <span>{h.name}</span>
              <span className="tm-pk" style={{ maxWidth: "45%", textAlign: "right" }}>
                {(h.address || "").slice(0, 36)}
                {(h.address || "").length > 36 ? "…" : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RitMap({ la1, lo1, la2, lo2, labelF, labelT }) {
  const el = useRef(null);
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    let cancelled = false;
    let cleanup = () => {};

    (async () => {
      if (hasGoogleMapsApiKey()) {
        try {
          const ctx = await createGoogleRouteMap(
            node,
            { lat: la1, lng: lo1, name: labelF || "Start" },
            { lat: la2, lng: lo2, name: labelT || "Einde" }
          );
          if (cancelled) {
            ctx?.dispose?.();
            return;
          }
          if (ctx) {
            const ro = new ResizeObserver(() => ctx.triggerResize());
            ro.observe(node);
            cleanup = () => {
              try {
                ro.disconnect();
              } catch {
                /* ignore */
              }
              ctx.dispose();
            };
            ctx.triggerResize();
            return;
          }
        } catch (e) {
          console.warn("Google Maps-kaart (rit) mislukt, fallback OSM:", e);
        }
      }

      if (cancelled) return;
      const map = L.map(node, { zoomControl: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap",
      }).addTo(map);
      let routeLayer = L.polyline(
        [
          [la1, lo1],
          [la2, lo2],
        ],
        { color: TM_ACC, weight: 4, opacity: 0.92 }
      ).addTo(map);
      const pin = (lat, lng, letter, tip) =>
        L.circleMarker([lat, lng], {
          radius: 9,
          fillColor: TM_ACC,
          color: "#141414",
          weight: 2,
          fillOpacity: 1,
        })
          .bindTooltip(`${letter}: ${tip}`, { permanent: true, direction: "top", className: "tm-leaf-tooltip" })
          .addTo(map);
      pin(la1, lo1, "A", labelF || "Start");
      pin(la2, lo2, "B", labelT || "Einde");
      map.fitBounds(
        [
          [la1, lo1],
          [la2, lo2],
        ],
        { padding: [36, 36], maxZoom: 11 }
      );
      getDrivingRouteWithGeometry({ lat: la1, lng: lo1 }, { lat: la2, lng: lo2 })
        .then(({ geometry }) => {
          if (cancelled || !geometry?.length) return;
          map.removeLayer(routeLayer);
          const latlngs = geometry.map(([lng, lat]) => [lat, lng]);
          routeLayer = L.polyline(latlngs, { color: TM_ACC, weight: 4, opacity: 0.92 }).addTo(map);
          map.fitBounds(routeLayer.getBounds(), { padding: [36, 36], maxZoom: 11 });
        })
        .catch(() => {});
      cleanup = () => {
        try {
          map.remove();
        } catch {
          /* ignore */
        }
      };
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [la1, lo1, la2, lo2, labelF, labelT]);
  return <div className="tm-rit-map" ref={el} role="presentation" />;
}

const TM_SWIPE_MAX = 92;
const TM_SWIPE_COMMIT = 52;

/** Lopende rit: horizontaal vegen → rechts voltooien, links annuleren (zelfde als knoppen). */
function LopendTripSwipe({ ritId, onAct, className, style, children }) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dxRef = useRef(0);
  const startXRef = useRef(0);
  const startDxRef = useRef(0);
  const ptrRef = useRef(null);

  const finish = (el, e) => {
    if (ptrRef.current == null || e.pointerId !== ptrRef.current) return;
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    ptrRef.current = null;
    setDragging(false);
    const x = dxRef.current;
    if (x >= TM_SWIPE_COMMIT) onAct(ritId, "ok");
    else if (x <= -TM_SWIPE_COMMIT) onAct(ritId, "no");
    dxRef.current = 0;
    setDx(0);
  };

  return (
    <div className="tm-trip-swipe-wrap">
      <div className="tm-trip-swipe-rail" aria-hidden="true">
        <div className="tm-trip-swipe-zone tm-trip-swipe-zone--ok">
          <span className="tm-trip-swipe-zone-ic" aria-hidden="true">
            ✓
          </span>
          <span className="tm-trip-swipe-zone-txt">Voltooien</span>
        </div>
        <div className="tm-trip-swipe-spacer" />
        <div className="tm-trip-swipe-zone tm-trip-swipe-zone--no">
          <span className="tm-trip-swipe-zone-ic" aria-hidden="true">
            ✕
          </span>
          <span className="tm-trip-swipe-zone-txt">Annuleer</span>
        </div>
      </div>
      <div
        className={className + " tm-trip-swipe-front"}
        style={{
          ...style,
          transform: `translateX(${dx}px)`,
          touchAction: "none",
          transition: dragging ? "none" : "transform 0.22s cubic-bezier(0.25, 0.85, 0.25, 1)",
        }}
        onPointerDown={e => {
          if (e.button !== 0) return;
          const t = e.target;
          if (t instanceof Element && t.closest("button")) return;
          ptrRef.current = e.pointerId;
          startXRef.current = e.clientX;
          startDxRef.current = dxRef.current;
          setDragging(true);
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={e => {
          if (e.pointerId !== ptrRef.current) return;
          const delta = e.clientX - startXRef.current;
          let next = startDxRef.current + delta;
          next = Math.max(-TM_SWIPE_MAX, Math.min(TM_SWIPE_MAX, next));
          dxRef.current = next;
          setDx(next);
        }}
        onPointerUp={e => finish(e.currentTarget, e)}
        onPointerCancel={e => finish(e.currentTarget, e)}
      >
        {children}
      </div>
    </div>
  );
}

function RitVergoedingUitleg({ r }) {
  const k = Math.max(0, Number(r.k) || 0);
  const u = vergoedingUitsplitsingVoorRit(k, r.ti || "", { fromName: r.f, toName: r.t });
  if (u.isSangoUzaForfait) {
    return (
      <div
        className="tm-rit-tarief-uitleg"
        style={{ fontSize: 10, color: "var(--tx3)", marginTop: 6, lineHeight: 1.4 }}
      >
        Vast forfait (Sango of RKV Mechelen ↔ UZA Edegem): {E(u.forfaitBasis != null ? u.forfaitBasis : u.vergoeding)}
      </div>
    );
  }
  const nacht = u.nachtToeslagEuro > 0.001;
  return (
    <div
      className="tm-rit-tarief-uitleg"
      style={{ fontSize: 10, color: "var(--tx3)", marginTop: 6, lineHeight: 1.4 }}
    >
      {E(u.opstartEuro)} opstart · {u.schijven}×(20 km) = {E(u.variabelDeel)}
      {nacht
        ? ` · nachttoeslag (schijven × ${u.nachtToeslagPercent}%) +${E(u.nachtToeslagEuro)}`
        : ""}
      {" · "}
      <span style={{ color: "var(--tx2)" }}>Berekend: {E(u.vergoeding)}</span>
    </div>
  );
}

function PPh({ v, set }) {
  return (
    <div className="tm-seg" role="tablist" aria-label="Periode" style={{ marginBottom: 14 }}>
      {[
        ["day", "Vandaag"],
        ["week", "Deze week"],
        ["month", "Deze maand"],
        ["all", "Alles"],
      ].map(([k, l]) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={v === k}
          className={"tm-seg-b" + (v === k ? " on" : "")}
          onClick={() => set(k)}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function buildTmFactuurMeta(settings, profileId) {
  const n = nextFactuurVolgNummer(profileId);
  const factuurDatum = new Date();
  const verval = new Date(factuurDatum.getTime());
  const dagen = Number(settings?.vervalDagen);
  verval.setDate(verval.getDate() + (Number.isFinite(dagen) && dagen >= 0 ? dagen : 30));
  return {
    factuurCode: n.factuurCode,
    orderDisplay: n.orderDisplay,
    factuurDatum,
    vervalDatum: verval,
  };
}

function tmRittenNaarFactuurRegels(ritten) {
  const sorted = [...ritten].sort((a, b) => (a.d + (a.ti || "")).localeCompare(b.d + (b.ti || "")));
  const regels = [];
  for (const r of sorted) {
    const bedrag = money(r.v);
    const tokens = parseBonNummers(r.bon);
    const n = tokens.length > 0 ? tokens.length : 1;
    const parts = splitBedragInLijnen(bedrag, n);
    const datumWeergave = `${r.d}${r.ti ? " · " + r.ti : ""}`;
    const ophaal = String(r.f || "").trim() || "—";
    const aflevering = String(r.t || "").trim() || "—";
    const km = r.k != null && Number.isFinite(Number(r.k)) ? String(r.k) : "—";
    for (let i = 0; i < n; i++) {
      const deel = parts[i] ?? 0;
      regels.push({
        titel: "Dienstverlening: ziekenhuisvervoer",
        prijsExcl: deel,
        totaal: deel,
        datumWeergave,
        orderBon: tokens.length ? tokens[i] : "—",
        ophaal,
        aflevering,
        km,
      });
    }
  }
  return regels;
}

function downloadFactuurCsv(ritten, fileStem) {
  const esc = c => `"${String(c ?? "").replace(/"/g, '""')}"`;
  const row = cells => cells.map(esc).join(";") + "\r\n";
  let t = "\uFEFF";
  t += row(["Datum", "Tijd", "Van", "Naar", "Km", "Bon", "Bedrag_EUR", "Chauffeur", "Voertuig"]);
  const sorted = [...ritten].sort((a, b) => (a.d + (a.ti || "")).localeCompare(b.d + (b.ti || "")));
  for (const r of sorted) {
    const tokens = parseBonNummers(r.bon);
    const n = tokens.length > 0 ? tokens.length : 1;
    const parts = splitBedragInLijnen(money(r.v), n);
    for (let i = 0; i < n; i++) {
      t += row([
        r.d,
        r.ti || "",
        r.f,
        r.t,
        r.k,
        tokens.length ? tokens[i] : "",
        (parts[i] ?? 0).toFixed(2).replace(".", ","),
        r.dr || "",
        r.ca || "",
      ]);
    }
  }
  const blob = new Blob([t], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const safe = String(fileStem || "export").replace(/[^\w.-]+/g, "_").slice(0, 48);
  a.download = `factuur-export-${safe}.csv`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

/** Voltooide rit in Historiek: km en vergoeding handmatig corrigeren. `handmatigKv` beschermt tegen bulk-herberekenen (Meer). */
function HistoriekVoltooideRitKaart({ r, D, pid, sD }) {
  const [open, setOpen] = useState(false);
  const [kmStr, setKmStr] = useState("");
  const [vStr, setVStr] = useState("");

  useEffect(() => {
    if (!open) return;
    setKmStr(String(r.k ?? ""));
    setVStr(money(r.v).toFixed(2).replace(".", ","));
  }, [open, r.id, r.k, r.v]);

  const mergeRit = useCallback(
    updater => {
      const rr = D.r.map(x => (x.id === r.id ? updater(x) : x));
      const nd = normData({ ...D, r: rr });
      sD(nd);
      sv(pid, nd);
    },
    [D, r.id, pid, sD]
  );

  const onSaveHandmatig = () => {
    const k = parseLooseNumber(kmStr);
    const v = parseLooseNumber(vStr);
    if (!Number.isFinite(k) || k < 1) {
      alert("Vul een geldige afstand (min. 1 km).");
      return;
    }
    if (!Number.isFinite(v) || v < 0) {
      alert("Vul een geldig bedrag (€).");
      return;
    }
    const kInt = Math.max(1, Math.round(k));
    mergeRit(cur => ({
      ...cur,
      k: kInt,
      v: Math.round(v * 100) / 100,
      handmatigKv: true,
    }));
    setOpen(false);
  };

  const onApplyTarief = () => {
    const k = parseLooseNumber(kmStr);
    if (!Number.isFinite(k) || k < 1) {
      alert("Vul eerst een geldige afstand (km).");
      return;
    }
    const kInt = Math.max(1, Math.round(k));
    const v = tmVergoeding(r.f, r.t, kInt, r.ti);
    const rounded = Math.round(v * 100) / 100;
    mergeRit(cur => {
      const next = { ...cur, k: kInt, v: rounded };
      delete next.handmatigKv;
      return next;
    });
    setOpen(false);
  };

  return (
    <div className="card card-l" style={{ marginBottom: 8, padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, color: "var(--tx3)" }}>
            {r.d}
            {r.ti ? " · " + r.ti : ""}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>
            {r.f} → {r.t}
          </div>
          {r.bon && <div style={{ fontSize: 11, color: "var(--tx2)", marginTop: 2 }}>Bon {r.bon}</div>}
          {r.handmatigKv && (
            <div style={{ fontSize: 11, color: "var(--am)", marginTop: 6, lineHeight: 1.35 }}>
              Km of bedrag zelf aangepast
            </div>
          )}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <Badge s={r.s} />
          <div style={{ fontSize: 16, fontWeight: 700, marginTop: 6 }} className="acc">
            {E(r.v)}
          </div>
          <div style={{ fontSize: 11, color: "var(--tx3)" }}>{r.k} km</div>
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <button type="button" className="btn btn-o" style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => setOpen(o => !o)}>
          {open ? "Sluiten" : "Km of bedrag aanpassen"}
        </button>
      </div>
      {open && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--bd)" }}>
          <div className="tm-g2" style={{ marginBottom: 10 }}>
            <div className="tm-fg">
              <label className="fl">Km</label>
              <input
                type="text"
                inputMode="decimal"
                value={kmStr}
                onChange={ev => setKmStr(ev.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="tm-fg">
              <label className="fl">Vergoeding (€)</label>
              <input
                type="text"
                inputMode="decimal"
                value={vStr}
                onChange={ev => setVStr(ev.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button type="button" className="btn btn-p" onClick={onSaveHandmatig}>
              Opslaan
            </button>
            <button type="button" className="btn btn-o" onClick={onApplyTarief}>
              Bedrag volgens tarief
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Historiek({ D, pid, sD }) {
  const [p, sP] = useState("month");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [xlsBusy, setXlsBusy] = useState(false);
  const [xlsInBusy, setXlsInBusy] = useState(false);
  const xlsInRef = useRef(null);
  const [s, e] = grExt(p, D.r);
  const [factuurVan, setFactuurVan] = useState(s);
  const [factuurTot, setFactuurTot] = useState(e);

  useEffect(() => {
    setFactuurVan(s);
    setFactuurTot(e);
  }, [s, e]);

  const [fs, fe] = useMemo(
    () => normFactuurDatumRange(factuurVan, factuurTot, s, e),
    [factuurVan, factuurTot, s, e]
  );

  const trips = useMemo(() => {
    return [...D.r]
      .filter(r => iR(r.d, s, e))
      .sort((a, b) => (b.d + (b.ti || "")).localeCompare(a.d + (a.ti || "")));
  }, [D.r, s, e]);
  const voltooidChron = useMemo(
    () =>
      trips
        .filter(r => r.s === "voltooid")
        .sort((a, b) => (a.d + (a.ti || "")).localeCompare(b.d + (b.ti || ""))),
    [trips]
  );
  const voltooidExportChron = useMemo(
    () =>
      [...D.r]
        .filter(r => r.s === "voltooid" && iR(r.d, fs, fe))
        .sort((a, b) => (a.d + (a.ti || "")).localeCompare(b.d + (b.ti || ""))),
    [D.r, fs, fe]
  );
  const omzet = voltooidChron.reduce((a, r) => a + money(r.v), 0);
  const brandstofL = useMemo(
    () => [...D.b].filter(b => iR(b.d, s, e)).sort((a, b) => b.d.localeCompare(a.d)),
    [D.b, s, e]
  );
  const overigL = useMemo(
    () => [...(D.o || [])].filter(x => iR(x.d, s, e)).sort((a, b) => b.d.localeCompare(a.d)),
    [D.o, s, e]
  );
  const brandstof = brandstofL.reduce((a, b) => a + money(b.a), 0);
  const overig = overigL.reduce((a, x) => a + money(x.a), 0);
  const kosten = brandstof + overig;
  const netto = omzet - kosten;
  const dLang = iso => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? fmtNlLongFromIso(iso).replace(/^\w+ /, "") : iso);
  const periodLabel =
    p === "all" ? "Alle ritten" : s === e ? dLang(s) : `${fmtNlShort(s)} tot ${fmtNlShort(e)}`;
  const factuurDatumLabel = fs === fe ? `Dag ${dLang(fs)}` : `${fmtNlShort(fs)} tot en met ${dLang(fe)}`;
  const exportStem = `${fs}_${fe}`.replace(/[^\w.-]+/g, "_");

  return (
    <div>
      <PPh v={p} set={sP} />
      <div className="card tm-rit-sum" style={{ marginBottom: 16 }}>
        <div className="tm-rvi">
          <span>Periode</span>
          <b>{periodLabel}</b>
        </div>
        <div className="tm-rvi">
          <span>Omzet</span>
          <b style={{ color: "var(--acc)" }}>{E(omzet)}</b>
        </div>
        <div className="tm-rvi">
          <span>Brandstof</span>
          <b style={{ color: "var(--rd)" }}>− {E(brandstof)}</b>
        </div>
        <div className="tm-rvi">
          <span>Overige kosten</span>
          <b style={{ color: "var(--rd)" }}>− {E(overig)}</b>
        </div>
        <div className="tm-rvi">
          <span>Netto</span>
          <b style={{ color: netto >= 0 ? "var(--gn)" : "var(--rd)" }}>{E(netto)}</b>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Factuur en rittenlijst</div>
        <div className="tm-g2" style={{ marginBottom: 12 }}>
          <div className="tm-fg">
            <label className="fl">Van</label>
            <input type="date" value={factuurVan} onChange={ev => setFactuurVan(ev.target.value)} />
          </div>
          <div className="tm-fg">
            <label className="fl">Tot en met</label>
            <input type="date" value={factuurTot} onChange={ev => setFactuurTot(ev.target.value)} />
          </div>
        </div>
        <p style={{ fontSize: 12, color: "var(--tx2)", margin: "0 0 12px", lineHeight: 1.45 }}>
          {voltooidExportChron.length === 1 ? "1 voltooide rit" : `${voltooidExportChron.length} voltooide ritten`} van{" "}
          {factuurDatumLabel.replace(/^Dag /, "")}. Factuurgegevens en logo pas je aan in Instellingen.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            type="button"
            className="btn btn-o btn-full"
            disabled={xlsBusy}
            onClick={async () => {
              setXlsBusy(true);
              try {
                const naam = (PR.find(x => x.id === pid) || { n: pid }).n;
                const S = getFactuurGegevens(pid);
                await downloadRittenExcel([{ naam, ritten: voltooidExportChron, btw: Number(S?.factuurBtwTarief) || 21 }], {
                  periode: factuurDatumLabel,
                  bestandsnaam: `Ritten_${naam}_${exportStem}`,
                });
              } catch (err) {
                console.error(err);
                alert("Excel maken mislukt: " + (err?.message || err));
              } finally {
                setXlsBusy(false);
              }
            }}
          >
            {xlsBusy ? "Excel wordt gemaakt…" : "Rittenlijst downloaden (Excel)"}
          </button>
          <input
            ref={xlsInRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            style={{ display: "none" }}
            onChange={async ev => {
              const file = ev.target.files?.[0];
              ev.target.value = "";
              if (!file) return;
              setXlsInBusy(true);
              try {
                const buf = await file.arrayBuffer();
                const naam = (PR.find(x => x.id === pid) || { n: pid }).n;
                const { ritten, overgeslagen } = await leesRittenExcel(buf, {
                  bestandsnaam: file.name,
                  chauffeur: naam,
                  voertuig: CA[0],
                  maakId: ui,
                });
                let duplicaten = 0;
                let n = 0;
                sD(nd => {
                  const uit = voegExcelRittenToe(nd.r, ritten);
                  duplicaten = uit.duplicaten;
                  n = uit.toegevoegd.length;
                  return n ? normData({ ...nd, r: uit.ritten }) : nd;
                });
                alert(meldingExcelInlees({ toegevoegd: n, duplicaten, overgeslagen }));
              } catch (err) {
                console.error(err);
                alert("Excel inlezen mislukt: " + (err?.message || err));
              } finally {
                setXlsInBusy(false);
              }
            }}
          />
          <button
            type="button"
            className="btn btn-o btn-full"
            disabled={xlsInBusy}
            onClick={() => xlsInRef.current?.click()}
          >
            {xlsInBusy ? "Excel wordt ingelezen…" : "Rittenlijst inlezen (Excel)"}
          </button>
          <button
            type="button"
            className="btn btn-p btn-full"
            disabled={pdfBusy}
            onClick={async () => {
              setPdfBusy(true);
              try {
                const S = getFactuurGegevens(pid);
                const meta = buildTmFactuurMeta(S, pid);
                const regels = tmRittenNaarFactuurRegels(voltooidExportChron);
                const { blob } = await generateFactuurPdfBlob({ factuurSettings: S, meta, regels });
                triggerPdfDownload(blob, `factuur-${meta.factuurCode}.pdf`);
              } catch (err) {
                console.error(err);
                alert("PDF mislukt: " + (err?.message || err));
              } finally {
                setPdfBusy(false);
              }
            }}
          >
            {pdfBusy ? "PDF wordt gemaakt…" : "Factuur downloaden (PDF)"}
          </button>
          <button
            type="button"
            className="btn btn-gh btn-full"
            onClick={() => downloadFactuurCsv(voltooidExportChron, exportStem)}
          >
            CSV voor boekhouder
          </button>
        </div>
      </div>

      <div className="sh">Ritten ({trips.length})</div>
      {trips.length === 0 && <p className="tm-em">Geen ritten in deze periode.</p>}
      {trips.map(r =>
        r.s === "voltooid" ? (
          <HistoriekVoltooideRitKaart key={r.id} r={r} D={D} pid={pid} sD={sD} />
        ) : (
          <div key={r.id} className="card card-l" style={{ marginBottom: 8, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: "var(--tx3)" }}>
                  {r.d}
                  {r.ti ? " · " + r.ti : ""}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>
                  {r.f} → {r.t}
                </div>
                {r.bon && <div style={{ fontSize: 11, color: "var(--tx2)", marginTop: 2 }}>Bon {r.bon}</div>}
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <Badge s={r.s} />
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 6 }} className="acc">
                  {E(r.v)}
                </div>
                <div style={{ fontSize: 11, color: "var(--tx3)" }}>{r.k} km</div>
              </div>
            </div>
          </div>
        )
      )}

      <div className="sh" style={{ marginTop: 16 }}>
        Tankbeurten ({brandstofL.length})
      </div>
      {brandstofL.length === 0 && <p className="tm-em">Geen tankbeurten in deze periode.</p>}
      {brandstofL.map(b => (
        <div key={b.id} className="tm-f-row" style={{ flexWrap: "wrap", alignItems: "center" }}>
          <span className="tm-f-date">{b.d}</span>
          <span style={{ flex: 1, minWidth: 100 }}>
            {money(b.l)} L × {E(money(b.p))}/L
          </span>
          <span className="tm-f-eur">{E(b.a)}</span>
        </div>
      ))}

      <div className="sh" style={{ marginTop: 16 }}>
        Overige kosten ({overigL.length})
      </div>
      {overigL.length === 0 && <p className="tm-em">Geen posten in deze periode.</p>}
      {overigL.map(x => (
        <div key={x.id} className="tm-f-row" style={{ flexWrap: "wrap" }}>
          <span className="tm-f-date">{x.d}</span>
          <span style={{ flex: 1, minWidth: 120 }}>{x.desc || "—"}</span>
          <span className="tm-f-eur">{E(x.a)}</span>
        </div>
      ))}
    </div>
  );
}

function Kosten({ D, sD, pid }) {
  const [type, sT] = useState("brandstof");
  const [fuelDet, sFuelDet] = useState(false);
  const [fm, sM] = useState({ d: td(), l: "", p: "", a: "", desc: "" });
  useEffect(() => {
    if (!fuelDet || !fm.l || !fm.p) return;
    const tot = parseFloat(fm.l) * parseFloat(fm.p);
    if (Number.isFinite(tot)) sM(m => ({ ...m, a: tot.toFixed(2) }));
  }, [fm.l, fm.p, fuelDet]);

  const saveFuel = () => {
    if (!fm.a) return;
    const nd = { ...D, b: [...D.b, { id: ui(), d: fm.d, l: +fm.l || 0, p: +fm.p || 0, a: +fm.a || 0 }] };
    sD(nd);
    sv(pid, nd);
    sM({ d: td(), l: "", p: "", a: "", desc: "" });
  };
  const saveOverig = () => {
    if (!fm.a || !fm.desc) return;
    const o = D.o || [];
    const nd = { ...D, o: [...o, { id: ui(), d: fm.d, a: +fm.a || 0, desc: fm.desc.trim() }] };
    sD(nd);
    sv(pid, nd);
    sM({ d: td(), l: "", p: "", a: "", desc: "" });
  };
  const delF = id => {
    const nd = { ...D, b: D.b.filter(f => f.id !== id) };
    sD(nd);
    sv(pid, nd);
  };
  const delO = id => {
    const nd = { ...D, o: (D.o || []).filter(x => x.id !== id) };
    sD(nd);
    sv(pid, nd);
  };

  return (
    <div>
      <div className="tm-seg" style={{ marginBottom: 14 }}>
        <button type="button" className={"tm-seg-b" + (type === "brandstof" ? " on" : "")} onClick={() => sT("brandstof")}>
          Brandstof
        </button>
        <button type="button" className={"tm-seg-b" + (type === "overig" ? " on" : "")} onClick={() => sT("overig")}>
          Overige kosten
        </button>
      </div>

      {type === "brandstof" && (
        <div className="card">
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Tankbeurt toevoegen</div>
          <div className="tm-fg">
            <label className="fl">Datum</label>
            <input type="date" value={fm.d} onChange={e => sM(m => ({ ...m, d: e.target.value }))} />
          </div>
          <div className="tm-fg">
            <label className="fl">Bedrag (€)</label>
            <input type="number" step="0.01" min="0" value={fm.a} onChange={e => sM(m => ({ ...m, a: e.target.value }))} />
          </div>
          <button
            type="button"
            className="btn btn-gh btn-full"
            style={{ marginBottom: 10 }}
            onClick={() => sFuelDet(v => !v)}
          >
            {fuelDet ? "Liter en prijs verbergen" : "Berekenen uit liter en prijs"}
          </button>
          {fuelDet && (
            <div className="tm-g2">
              <div className="tm-fg">
                <label className="fl">Liter</label>
                <input type="number" step="0.1" min="0" value={fm.l} onChange={e => sM(m => ({ ...m, l: e.target.value }))} />
              </div>
              <div className="tm-fg">
                <label className="fl">€/L</label>
                <input type="number" step="0.01" min="0" value={fm.p} onChange={e => sM(m => ({ ...m, p: e.target.value }))} />
              </div>
            </div>
          )}
          <button type="button" className="btn btn-p btn-full" disabled={!fm.a} onClick={saveFuel}>
            Opslaan
          </button>
        </div>
      )}

      {type === "overig" && (
        <div className="card">
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Kost toevoegen</div>
          <div className="tm-g2">
            <div className="tm-fg">
              <label className="fl">Datum</label>
              <input type="date" value={fm.d} onChange={e => sM(m => ({ ...m, d: e.target.value }))} />
            </div>
            <div className="tm-fg">
              <label className="fl">Bedrag (€)</label>
              <input type="number" step="0.01" value={fm.a} onChange={e => sM(m => ({ ...m, a: e.target.value }))} />
            </div>
          </div>
          <div className="tm-fg">
            <label className="fl">Omschrijving</label>
            <input
              type="text"
              value={fm.desc}
              placeholder="Bv. verzekering, onderhoud…"
              onChange={e => sM(m => ({ ...m, desc: e.target.value }))}
            />
          </div>
          <button type="button" className="btn btn-p btn-full" disabled={!fm.a || !fm.desc.trim()} onClick={saveOverig}>
            Opslaan
          </button>
        </div>
      )}

      <div className="sh" style={{ marginTop: 16 }}>
        Brandstof ({D.b.length})
      </div>
      {D.b.length === 0 && <p className="tm-em">Nog geen tankbeurten.</p>}
      {[...D.b].sort((a, b) => b.d.localeCompare(a.d)).map(f => (
        <div key={f.id} className="tm-brow">
          <span style={{ fontWeight: 600, flex: 1 }}>{f.d}</span>
          <span style={{ fontWeight: 600, color: "var(--rd)" }}>{E(f.a)}</span>
          <button type="button" className="btn btn-gh" style={{ marginLeft: 8 }} onClick={() => delF(f.id)}>
            ✕
          </button>
        </div>
      ))}

      <div className="sh" style={{ marginTop: 16 }}>
        Overige kosten ({(D.o || []).length})
      </div>
      {(D.o || []).length === 0 && <p className="tm-em">Nog geen overige kosten.</p>}
      {[...(D.o || [])].sort((a, b) => b.d.localeCompare(a.d)).map(o => (
        <div key={o.id} className="tm-brow">
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{o.d}</div>
            <div style={{ fontSize: 12, color: "var(--tx3)" }}>{o.desc}</div>
          </div>
          <span style={{ fontWeight: 600, color: "var(--rd)" }}>{E(o.a)}</span>
          <button type="button" className="btn btn-gh" style={{ marginLeft: 8 }} onClick={() => delO(o.id)}>
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

const MAX_TM_LOGO_CHARS = 450000;

function readTmFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error("Lezen mislukt"));
    r.readAsDataURL(file);
  });
}

function downscaleTmLogoDataUrl(dataUrl, maxSide, jpegQuality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        const scale = Math.min(1, maxSide / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", jpegQuality));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error("Afbeelding"));
    img.src = dataUrl;
  });
}

/** Zelfde velden als klassieke app (factuurGegevensMeer.js) — localStorage per profiel. */
function FactuurGegevensScherm({ pid }) {
  const [S, setS] = useState(() => getFactuurGegevens(pid));
  const [hint, setHint] = useState(false);
  const logoInpRef = useRef(null);

  useEffect(() => {
    setS(getFactuurGegevens(pid));
  }, [pid]);

  const persistAll = () => {
    const verval = Number.parseInt(String(S.vervalDagen), 10);
    const btwTariefRaw = Number.parseFloat(String(S.factuurBtwTarief ?? 21));
    const btwTarief = Number.isFinite(btwTariefRaw) ? Math.min(100, Math.max(0, btwTariefRaw)) : 21;
    const klantBedrijf = String(S.klantBedrijfsnaam || "").trim();
    saveFactuurGegevens(
      {
        bedrijfsnaam: String(S.bedrijfsnaam || "").trim(),
        adresStraat: String(S.adresStraat || "").trim(),
        adresPostcodeStad: String(S.adresPostcodeStad || "").trim(),
        land: String(S.land || "").trim() || "België",
        btwNummer: String(S.btwNummer || "").trim(),
        rekeninghouder: String(S.rekeninghouder || "").trim(),
        iban: String(S.iban || "").trim(),
        email: String(S.email || "").trim(),
        telefoon: String(S.telefoon || "").trim(),
        klantBedrijfsnaam: klantBedrijf,
        klantNaam: klantBedrijf,
        klantContactpersoon: String(S.klantContactpersoon || "").trim(),
        klantBtw: String(S.klantBtw || "").trim(),
        klantAdres: String(S.klantAdres || "").trim(),
        klantLand: String(S.klantLand || "").trim() || "België",
        factuurBtwAanrekenen: Boolean(S.factuurBtwAanrekenen),
        factuurBtwTarief: btwTarief,
        btwVrijstellingTekst: String(S.btwVrijstellingTekst || "").trim(),
        vervalDagen: Number.isFinite(verval) && verval >= 0 ? verval : 30,
        dagrapportEmailAan: Boolean(S.dagrapportEmailAan),
        dagrapportOntvanger: String(S.dagrapportOntvanger || "").trim(),
      },
      pid
    );
    setS(getFactuurGegevens(pid));
    setHint(true);
    setTimeout(() => setHint(false), 2500);
  };

  const onLogoChange = async e => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      alert("Kies een afbeeldingsbestand (PNG, JPG, …).");
      return;
    }
    try {
      let dataUrl = await readTmFileAsDataUrl(f);
      if (dataUrl.length > MAX_TM_LOGO_CHARS) {
        dataUrl = await downscaleTmLogoDataUrl(dataUrl, 400, 0.82);
      }
      if (dataUrl.length > MAX_TM_LOGO_CHARS) {
        alert("Logo is te groot na verkleinen. Kies een kleiner bestand.");
        return;
      }
      saveFactuurGegevens({ logoDataUrl: dataUrl }, pid);
      setS(getFactuurGegevens(pid));
    } catch (err) {
      console.error(err);
      alert("Logo kon niet worden geladen.");
    }
  };

  const clearLogo = () => {
    saveFactuurGegevens({ logoDataUrl: "" }, pid);
    setS(getFactuurGegevens(pid));
  };

  const hasLogo = S.logoDataUrl && String(S.logoDataUrl).startsWith("data:image");
  const fg = (key, label, ph, type = "text") => (
    <div className="tm-fg">
      <label className="fl">{label}</label>
      <input
        type={type}
        value={S[key] ?? ""}
        placeholder={ph}
        onChange={e => setS(prev => ({ ...prev, [key]: e.target.value }))}
      />
    </div>
  );

  return (
    <div>
      <p className="tm-lead">Deze gegevens en het logo komen op elke PDF-factuur.</p>

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Logo</div>
        {hasLogo ? (
          <img
            src={S.logoDataUrl}
            alt="Bedrijfslogo"
            style={{
              maxWidth: 140,
              maxHeight: 120,
              objectFit: "contain",
              marginBottom: 12,
              borderRadius: 8,
              border: "1px solid var(--bd)",
              background: "var(--s1)",
            }}
          />
        ) : (
          <p style={{ fontSize: 12, color: "var(--tx3)", margin: "0 0 10px" }}>Nog geen logo. Zonder logo blijft de factuur gewoon geldig.</p>
        )}
        <input ref={logoInpRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onLogoChange} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-o" onClick={() => logoInpRef.current?.click()}>
            Logo kiezen
          </button>
          {hasLogo && (
            <button type="button" className="btn btn-gh" onClick={clearLogo}>
              Logo wissen
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Van</div>
        {fg("bedrijfsnaam", "Bedrijfsnaam", "")}
        {fg("adresStraat", "Adres (straat + nr)", "")}
        {fg("adresPostcodeStad", "Postcode en gemeente", "")}
        {fg("land", "Land", "België")}
        {fg("btwNummer", "BTW-nummer", "")}
        {fg("rekeninghouder", "Rekeninghouder", "")}
        {fg("iban", "IBAN", "")}
        {fg("email", "E-mail", "", "email")}
        {fg("telefoon", "Telefoon", "")}
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Aan (klant)</div>
        {fg("klantBedrijfsnaam", "Bedrijfsnaam / instantie", "")}
        {fg("klantContactpersoon", "Contactpersoon (t.a.v.)", "")}
        {fg("klantAdres", "Adres klant", "")}
        {fg("klantLand", "Land klant", "België")}
        {fg("klantBtw", "BTW-nummer klant", "")}
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Btw en betaaltermijn</div>
        <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={Boolean(S.factuurBtwAanrekenen)}
            onChange={e => setS(prev => ({ ...prev, factuurBtwAanrekenen: e.target.checked }))}
          />
          <span>BTW aanrekenen op ritbedragen</span>
        </label>
        {S.factuurBtwAanrekenen && (
          <div className="tm-fg">
            <label className="fl">BTW-tarief (%)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={S.factuurBtwTarief ?? 21}
              onChange={e => setS(prev => ({ ...prev, factuurBtwTarief: e.target.value }))}
            />
          </div>
        )}
        <div className="tm-fg">
          <label className="fl">Tekst onderaan de factuur</label>
          <textarea
            rows={3}
            value={S.btwVrijstellingTekst ?? ""}
            onChange={e => setS(prev => ({ ...prev, btwVrijstellingTekst: e.target.value }))}
            style={{ width: "100%", padding: 12, background: "var(--s2)", border: "1px solid var(--bd)", borderRadius: 8, color: "var(--tx)" }}
          />
        </div>
        <div className="tm-fg">
          <label className="fl">Vervaldagen na factuurdatum</label>
          <input
            type="number"
            min="0"
            max="365"
            value={S.vervalDagen ?? 30}
            onChange={e => setS(prev => ({ ...prev, vervalDagen: e.target.value }))}
          />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Weekrapport per e-mail</div>
        <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={Boolean(S.dagrapportEmailAan)}
            onChange={e => setS(prev => ({ ...prev, dagrapportEmailAan: e.target.checked }))}
          />
          <span>Weekrapport per e-mail inschakelen</span>
        </label>
        {fg("dagrapportOntvanger", "E-mail ontvanger", "")}
      </div>

      <button type="button" className="btn btn-p btn-full" onClick={persistAll}>
        Factuurgegevens opslaan
      </button>
      {hint && (
        <p style={{ fontSize: 13, color: "var(--gn)", marginTop: 12, textAlign: "center" }}>
          Opgeslagen.
        </p>
      )}
    </div>
  );
}

const BON_FOTO_MAX_FILES = 35;
const BON_FOTO_MAX_MB = 14;

function suggestRitIdFromOcr(codes, dates, pool, bonAlreadyUsed) {
  const fresh = codes.filter(c => {
    const n = normBonFromScan(c);
    return n && !bonAlreadyUsed.has(n.toUpperCase());
  });
  if (fresh.length === 0) return "";
  const byDate =
    dates.length > 0 ? pool.filter(r => dates.some(d => String(r.d).slice(0, 10) === d)) : pool;
  const p = byDate.length > 0 ? byDate : pool;
  const zonder = p.filter(r => !String(r.bon || "").trim());
  if (fresh.length >= 1 && zonder.length === 1) return zonder[0].id;
  if (fresh.length === 1 && dates.length === 1) {
    const onDay = p.filter(r => r.d === dates[0]);
    const z2 = onDay.filter(r => !String(r.bon || "").trim());
    if (z2.length === 1) return z2[0].id;
  }
  return "";
}

/** Foto’s van transportbonnen: OCR (IHcT) en koppelen aan voltooide ritten voor factuur/CSV. */
function BonFotoImportSection({ D, sD, pid }) {
  const [van, setVan] = useState(() => mo()[0]);
  const [tot, setTot] = useState(() => mo()[1]);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInpRef = useRef(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(
    () => () => {
      rowsRef.current.forEach(row => {
        if (row.previewUrl) URL.revokeObjectURL(row.previewUrl);
      });
      terminateBonOcrWorker().catch(() => {});
    },
    []
  );

  const voltooidePool = useMemo(
    () =>
      [...D.r]
        .filter(r => r.s === "voltooid" && iR(r.d, van, tot))
        .sort((a, b) => (a.d + (a.ti || "")).localeCompare(b.d + (b.ti || ""))),
    [D.r, van, tot]
  );

  const bonAlreadyUsed = useMemo(() => {
    const s = new Set();
    for (const r of D.r) {
      for (const b of parseBonNummers(r.bon)) s.add(b.toUpperCase());
    }
    return s;
  }, [D.r]);

  const addImageFiles = useCallback(fileList => {
    const arr = Array.from(fileList || []).filter(f => f.type.startsWith("image/"));
    if (arr.length === 0) return;
    const tooBig = arr.filter(f => f.size > BON_FOTO_MAX_MB * 1024 * 1024);
    if (tooBig.length) {
      alert(`Eén of meer bestanden zijn groter dan ${BON_FOTO_MAX_MB} MB — niet toegevoegd.`);
    }
    const ok = arr.filter(f => f.size <= BON_FOTO_MAX_MB * 1024 * 1024);
    setRows(cur => {
      const room = BON_FOTO_MAX_FILES - cur.length;
      if (room <= 0) {
        alert(`Maximum ${BON_FOTO_MAX_FILES} foto’s. Verwijder eerst rijen.`);
        return cur;
      }
      const take = ok.slice(0, room);
      if (ok.length > room) alert(`Alleen de eerste ${room} foto’s toegevoegd (limiet ${BON_FOTO_MAX_FILES}).`);
      const next = [...cur];
      for (const file of take) {
        next.push({
          id: ui(),
          file,
          previewUrl: URL.createObjectURL(file),
          status: "queued",
          text: "",
          codes: [],
          dates: [],
          selectedRitId: "",
          errMsg: "",
        });
      }
      return next;
    });
  }, []);

  const removeRow = id => {
    setRows(cur => {
      const row = cur.find(r => r.id === id);
      if (row?.previewUrl) URL.revokeObjectURL(row.previewUrl);
      return cur.filter(r => r.id !== id);
    });
  };

  const clearRows = () => {
    setRows(cur => {
      cur.forEach(r => {
        if (r.previewUrl) URL.revokeObjectURL(r.previewUrl);
      });
      return [];
    });
  };

  const setRitForRow = (rowId, ritId) => {
    setRows(cur => cur.map(r => (r.id === rowId ? { ...r, selectedRitId: ritId } : r)));
  };

  const runOcr = async () => {
    const pending = rows.filter(r => r.status === "queued" || r.status === "error");
    if (pending.length === 0) {
      alert("Geen nieuwe foto’s in de wachtrij.");
      return;
    }
    setBusy(true);
    setProgress(0);
    try {
      let done = 0;
      for (const row of pending) {
        setRows(cur =>
          cur.map(r => (r.id === row.id ? { ...r, status: "ocr", errMsg: "" } : r))
        );
        try {
          const { text, codes, dates } = await recognizeBonImage(row.file, {
            logger: m => {
              if (m.status === "recognizing text" && typeof m.progress === "number") {
                const slice = (done + m.progress) / pending.length;
                setProgress(slice);
              }
            },
          });
          const sug = suggestRitIdFromOcr(codes, dates, voltooidePool, bonAlreadyUsed);
          setRows(cur =>
            cur.map(r =>
              r.id === row.id
                ? {
                    ...r,
                    status: "done",
                    text,
                    codes,
                    dates,
                    selectedRitId: r.selectedRitId || sug || "",
                  }
                : r
            )
          );
        } catch (e) {
          console.error(e);
          setRows(cur =>
            cur.map(r =>
              r.id === row.id
                ? { ...r, status: "error", errMsg: String(e?.message || e || "Herkennen mislukt") }
                : r
            )
          );
        }
        done += 1;
        setProgress(done / pending.length);
      }
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const applyToTrips = () => {
    const todo = rows.filter(r => r.status === "done" && r.selectedRitId && r.codes.length > 0);
    if (todo.length === 0) {
      alert("Kies per foto een rit en zorg dat er minstens één bonnummer herkend is.");
      return;
    }
    let rr = [...D.r];
    let n = 0;
    for (const row of todo) {
      const idx = rr.findIndex(x => x.id === row.selectedRitId);
      if (idx < 0) continue;
      const merged = mergeBonField(rr[idx].bon, row.codes);
      if (!merged) continue;
      rr[idx] = { ...rr[idx], bon: merged };
      n += 1;
    }
    if (n === 0) {
      alert("Geen wijzigingen — controleer de gekozen ritten.");
      return;
    }
    const nd = normData({ ...D, r: rr });
    sD(nd);
    sv(pid, nd);
      alert(`${n} foto${n === 1 ? "" : "’s"} toegepast — bonnen staan op de ritten.`);
    clearRows();
  };

  const dropProps = {
    onDragOver: e => {
      e.preventDefault();
      setDragOver(true);
    },
    onDragLeave: () => setDragOver(false),
    onDrop: e => {
      e.preventDefault();
      setDragOver(false);
      addImageFiles(e.dataTransfer.files);
    },
  };

  return (
    <div style={{ marginTop: 4, marginBottom: 8 }}>
      <p className="tm-card-p">
        Voeg foto’s van transportbonnen toe. De app leest het bonnummer en koppelt het aan de juiste voltooide rit,
        zodat het op de factuur komt. De eerste keer is internet nodig.
      </p>
      <div className="tm-g2" style={{ marginBottom: 12 }}>
        <div className="tm-fg">
          <label className="fl">Ritten vanaf</label>
          <input type="date" value={van} onChange={e => setVan(e.target.value)} />
        </div>
        <div className="tm-fg">
          <label className="fl">Tot en met</label>
          <input type="date" value={tot} onChange={e => setTot(e.target.value)} />
        </div>
      </div>
      <p style={{ fontSize: 11, color: "var(--tx3)", margin: "0 0 10px", lineHeight: 1.35 }}>
        {voltooidePool.length === 1 ? "1 voltooide rit" : `${voltooidePool.length} voltooide ritten`} in deze periode,
        waarvan {voltooidePool.filter(r => !String(r.bon || "").trim()).length} zonder bon.
      </p>
      <div
        {...dropProps}
        className="card"
        style={{
          padding: 18,
          marginBottom: 12,
          borderStyle: "dashed",
          borderWidth: 2,
          borderColor: dragOver ? "var(--acc)" : "var(--bd)",
          background: dragOver ? "rgba(109, 133, 40, 0.08)" : "var(--s2)",
          textAlign: "center",
          cursor: "pointer",
        }}
        onClick={() => !busy && fileInpRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInpRef.current?.click();
          }
        }}
      >
        <input
          ref={fileInpRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={e => {
            addImageFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Sleep foto’s hierheen of tik om te kiezen</div>
        <div style={{ fontSize: 12, color: "var(--tx3)" }}>JPG, PNG, … · max {BON_FOTO_MAX_FILES} foto’s · max {BON_FOTO_MAX_MB} MB per bestand</div>
      </div>
      {progress != null && (
        <div style={{ fontSize: 12, color: "var(--tx2)", marginBottom: 8 }}>
          Bezig… {Math.round(progress * 100)}%
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <button type="button" className="btn btn-p" disabled={busy || rows.length === 0} onClick={runOcr}>
          {busy ? "Bezig…" : "Tekst herkennen"}
        </button>
        <button type="button" className="btn btn-o" disabled={busy || rows.length === 0} onClick={clearRows}>
          Lijst wissen
        </button>
        <button type="button" className="btn btn-o" disabled={busy} onClick={() => applyToTrips()}>
          Bonnen op ritten zetten
        </button>
      </div>
      {rows.length === 0 ? (
        <p style={{ fontSize: 12, color: "var(--tx3)", margin: 0 }}>Nog geen foto’s.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map(row => (
            <div
              key={row.id}
              className="tm-brow"
              style={{ flexWrap: "wrap", alignItems: "flex-start", gap: 10, padding: "10px 0" }}
            >
              {row.previewUrl && (
                <img
                  src={row.previewUrl}
                  alt=""
                  style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6, flexShrink: 0 }}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: "var(--tx3)", marginBottom: 4 }}>
                  {row.file?.name || "—"} ·{" "}
                  {row.status === "queued"
                    ? "Nog te lezen"
                    : row.status === "ocr"
                      ? "Bezig…"
                      : row.status === "done"
                        ? "Herkenning klaar"
                        : row.status === "error"
                          ? "Fout"
                          : row.status}
                </div>
                {row.codes.length > 0 ? (
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--acc)", marginBottom: 4 }}>
                    {row.codes.join(" · ")}
                  </div>
                ) : row.status === "done" ? (
                  <div style={{ fontSize: 12, color: "var(--am)", marginBottom: 4 }}>
                    Geen bonnummer gevonden — typ de bon handmatig of probeer een scherpere foto.
                  </div>
                ) : null}
                {row.dates.length > 0 && (
                  <div style={{ fontSize: 10, color: "var(--tx3)" }}>Datum in tekst: {row.dates.join(", ")}</div>
                )}
                {row.errMsg && <div style={{ fontSize: 11, color: "var(--rd)", marginTop: 4 }}>{row.errMsg}</div>}
                {(row.status === "done" || row.status === "queued") && (
                  <div className="tm-fg" style={{ marginTop: 8, marginBottom: 0 }}>
                    <label className="fl">Koppel aan rit</label>
                    <select
                      value={row.selectedRitId}
                      onChange={e => setRitForRow(row.id, e.target.value)}
                      style={{ width: "100%", maxWidth: "100%" }}
                    >
                      <option value="">— Kies rit —</option>
                      {voltooidePool.map(r => (
                        <option key={r.id} value={r.id}>
                          {r.d} {r.ti || ""} · {r.f} → {r.t}
                          {r.bon ? ` · bon ${r.bon}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <button type="button" className="btn btn-gh" onClick={() => removeRow(row.id)} disabled={busy}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Meer({ D, sD, pid, pr, onBackupImported }) {
  const [v, sV] = useState("m");
  const [erA, setErA] = useState(null);
  const [erB, setErB] = useState(null);
  const [erK, setErK] = useState("");
  const [erBusy, setErBusy] = useState(false);
  const [recalcRittenBusy, setRecalcRittenBusy] = useState(false);
  const [herberekenTariefBusy, setHerberekenTariefBusy] = useState(false);
  const [googleTestBusy, setGoogleTestBusy] = useState(false);
  const [googleTestMsg, setGoogleTestMsg] = useState("");
  const backupFileRef = useRef(null);
  const ziekenVoorMeer = useMemo(
    () => ziekenLijstMetArchief(TM_ZIEKENHUIZEN_LIJST, D.xrArch || []),
    [D.xrArch]
  );

  const testGoogleDirections = async () => {
    if (!hasGoogleMapsApiKey()) {
      setGoogleTestMsg("Afstanden worden gemeten met de gratis routedienst. Die kan enkele kilometers afwijken.");
      return;
    }
    setGoogleTestBusy(true);
    setGoogleTestMsg("");
    try {
      const brussel = { lat: 50.8824, lng: 4.2745 };
      const leuven = { lat: 50.8814, lng: 4.671 };
      const { km } = await getDrivingRouteKm(brussel, leuven);
      setGoogleTestMsg(`OK: UZ Brussel naar UZ Leuven is ${km} km.`);
    } catch (e) {
      const m = String(e?.message || e);
      setGoogleTestMsg(`Meting mislukt: ${m}. Probeer later opnieuw of vul de km handmatig in.`);
    } finally {
      setGoogleTestBusy(false);
    }
  };

  const berekenEigenKm = async () => {
    if (erA?.lat == null || erB?.lat == null) {
      alert("Kies twee locaties met coördinaten, of vul km handmatig.");
      return;
    }
    setErBusy(true);
    try {
      const { km } = await getDrivingRouteKm(
        { lat: erA.lat, lng: erA.lng },
        { lat: erB.lat, lng: erB.lng }
      );
      if (km != null && Number.isFinite(km) && km >= 1) setErK(String(km));
      else alert("Kon geen afstand berekenen.");
    } catch (e) {
      console.error(e);
      alert(
        "Geen autoroute over het wegennet opgehaald (internet nodig, geen vogelvlucht). Vul km handmatig of probeer later."
      );
    } finally {
      setErBusy(false);
    }
  };

  const herberekenAlleRittenKm = async () => {
    if (
      !confirm(
        "Alle ritten opnieuw meten over de weg (internet nodig). Km en bedrag worden bijgewerkt. Ritten waarvan je km of bedrag zelf hebt aangepast blijven ongewijzigd. Doorgaan?"
      )
    ) {
      return;
    }
    setRecalcRittenBusy(true);
    try {
      const merged = tmBuildMergedRoutes(D);
      const nextR = [];
      for (const r of D.r) {
        if (r.handmatigKv) {
          nextR.push(r);
          continue;
        }
        const pair = tmResolveRitRouteCoords(r.f, r.t, merged);
        if (!pair) {
          nextR.push(r);
          continue;
        }
        try {
          const { km } = await getDrivingRouteKm(pair.a, pair.b);
          if (!km || km < 1) {
            nextR.push(r);
            continue;
          }
          const v = vergoedingVoorRit(km, r.ti || "", { fromName: r.f, toName: r.t });
          nextR.push({ ...r, k: km, v: Math.round(v * 100) / 100 });
        } catch {
          nextR.push(r);
        }
        await new Promise(res => setTimeout(res, 280));
      }
      const nd = normData({ ...D, r: nextR });
      sD(nd);
      sv(pid, nd);
      alert("Klaar. Ritten met herkenbare route zijn herberekend; andere bleven ongewijzigd.");
    } finally {
      setRecalcRittenBusy(false);
    }
  };

  const herberekenVergoedingenLokaal = () => {
    if (
      !confirm(
        "Alle ritten opnieuw op het huidige tarief zetten? Ritten waarvan je km of bedrag zelf hebt aangepast blijven ongewijzigd."
      )
    ) {
      return;
    }
    setHerberekenTariefBusy(true);
    try {
      const next = autoFixRitBerekeningen(D);
      if (next === D) {
        alert("Geen wijzigingen nodig — alles is al in lijn met de tarieven (of alles is handmatig afgeschermd).");
        return;
      }
      sD(next);
      sv(pid, next);
      alert("Klaar. € en km (waar van toepassing) zijn opnieuw berekend met de huidige regels.");
    } finally {
      setHerberekenTariefBusy(false);
    }
  };

  const addEigenRoute = () => {
    const f = (erA?.name || "").trim();
    const t = (erB?.name || "").trim();
    const k = Number(String(erK).replace(",", "."));
    if (!f || !t) {
      alert("Kies vertrek en bestemming via de zoeklijst.");
      return;
    }
    if (!Number.isFinite(k) || k < 1) {
      alert("Vul een geldige afstand in km, of tik op ‘Afstand meten’.");
      return;
    }
    const dup =
      ROUTES.some(r => r.f === f && r.t === t) || (D.xr || []).some(r => r.f === f && r.t === t);
    if (dup) {
      alert("Deze route staat al in de lijst (standaard of eigen).");
      return;
    }
    const row = { id: ui(), f, t, k };
    if (erA?.lat != null && erB?.lat != null) {
      row.la1 = erA.lat;
      row.lo1 = erA.lng;
      row.la2 = erB.lat;
      row.lo2 = erB.lng;
    }
    const nd = normData({ ...D, xr: [...(D.xr || []), row] });
    sD(nd);
    sv(pid, nd);
    setErA(null);
    setErB(null);
    setErK("");
  };

  const delEigenRoute = id => {
    const hit = (D.xr || []).find(x => x.id === id);
    const rest = (D.xr || []).filter(x => x.id !== id);
    let xrArch = [...(D.xrArch || [])];
    if (hit) {
      const snap = parseXrLikeRow(hit, 0, "xra");
      if (snap) {
        const rk = tmRouteKey(snap);
        xrArch = [snap, ...xrArch.filter(x => tmRouteKey(x) !== rk)].slice(0, 40);
      }
    }
    const nd = normData({ ...D, xr: rest, xrArch });
    sD(nd);
    sv(pid, nd);
  };
  const backupPanel = (
    <div>
      <p className="tm-lead">
        {pr.n} heeft {D.r.length} ritten, {D.b.length} tankbeurten en {(D.o || []).length} overige kosten op dit toestel.
      </p>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="tm-card-t">Volledige back-up</div>
        <p className="tm-card-p">
          Alle chauffeurs en instellingen in één bestand. Bewaar het op een veilige plek; de app zelf bewaart niets online.
        </p>
        <button type="button" className="btn btn-p btn-full" style={{ marginBottom: 8 }} onClick={() => exportTransporteurData()}>
          Back-up downloaden
        </button>
        <input
          ref={backupFileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: "none" }}
          onChange={async e => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            try {
              const text = await f.text();
              const payload = JSON.parse(text);
              const volledig = confirm(
                "Alles op dit toestel vervangen door de back-up?\n\n" +
                  "OK: eerst alle gegevens hier wissen en dan de back-up terugzetten (aanbevolen op een nieuwe telefoon).\n" +
                  "Annuleren: alleen de onderdelen uit het bestand overschrijven."
              );
              const n = applyImportPayload(payload, { replaceAll: volledig });
              alert(`Back-up teruggezet (${n} onderdelen).`);
              onBackupImported?.();
            } catch (err) {
              console.error(err);
              alert("Dit bestand kan niet worden ingelezen. Kies een .json-back-up van TransportMe.");
            }
          }}
        />
        <button type="button" className="btn btn-o btn-full" onClick={() => backupFileRef.current?.click()}>
          Back-up terugzetten
        </button>
      </div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="tm-card-t">Alleen {pr.n}</div>
        <button
          type="button"
          className="btn btn-o btn-full"
          style={{ marginBottom: 8 }}
          onClick={() => {
            const b = new Blob([JSON.stringify(D, null, 2)], { type: "application/json" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(b);
            a.download = "transportme-" + pid + ".json";
            a.click();
            URL.revokeObjectURL(a.href);
          }}
        >
          Gegevens van {pr.n} exporteren
        </button>
        <button
          type="button"
          className="btn btn-o btn-full"
          style={{ marginBottom: 8 }}
          onClick={() => {
            const leg = leesLegacyBundel(pid);
            const n = leg.r.length + leg.b.length + leg.o.length;
            if (n === 0) {
              alert(`Er staan geen gegevens van ${pr.n} uit de vorige versie van de app op dit toestel.`);
              return;
            }
            if (
              !confirm(
                `De gegevens van ${pr.n} vervangen door ${leg.r.length} ritten, ${leg.b.length} tankbeurten en ${leg.o.length} kosten uit de vorige versie van de app?`
              )
            ) {
              return;
            }
            const merged = normData({ ...leg, xr: D.xr || [] });
            sD(merged);
            sv(pid, merged);
            alert("Gegevens hersteld.");
          }}
        >
          Herstellen uit vorige app-versie
        </button>
        <button
          type="button"
          className="btn btn-r btn-full"
          onClick={() => {
            if (confirm(`Alle ritten en kosten van ${pr.n} wissen? Dit kan niet ongedaan worden.`)) {
              const n = normData({ r: [], b: [], o: [], xr: [], xrArch: [] });
              sD(n);
              sv(pid, n);
            }
          }}
        >
          Alles van {pr.n} wissen
        </button>
      </div>
    </div>
  );

  if (v !== "m")
    return (
      <div>
        <button type="button" className="tm-back" onClick={() => sV("m")}>
          Instellingen
        </button>
        <h2 className="tm-sub-h">{v === "f" ? `Factuurgegevens van ${pr.n}` : "Back-up en herstel"}</h2>
        {v === "f" && <FactuurGegevensScherm pid={pid} />}
        {v === "d" && backupPanel}
      </div>
    );

  const googleMapsKey = hasGoogleMapsApiKey();

  return (
    <div className="tm-meer-hub">
      <section className="tm-meer-sec">
        <h2 className="tm-meer-sec-h">Facturatie</h2>
        <button type="button" className="tm-mi" onClick={() => sV("f")}>
          <strong>Factuurgegevens en logo</strong>
          <small>Naam, adres, btw en logo op de facturen van {pr.n}</small>
        </button>
        <button type="button" className="tm-mi" onClick={() => sV("d")}>
          <strong>Back-up en herstel</strong>
          <small>Alle gegevens bewaren of terugzetten op een ander toestel</small>
        </button>
      </section>

      <section className="tm-meer-sec">
        <h2 className="tm-meer-sec-h">Vaste routes van {pr.n}</h2>
        <div className="card">
          <p className="tm-card-p">
            Zoek twee ziekenhuizen of adressen. De afstand wordt over de weg gemeten en daarna kun je hem nog aanpassen.
          </p>
          <PlaatsPicker label="Vertrek" gekozen={erA} onKies={setErA} lijst={ziekenVoorMeer} />
          <PlaatsPicker label="Bestemming" gekozen={erB} onKies={setErB} lijst={ziekenVoorMeer} />
          <button type="button" className="btn btn-o btn-full" style={{ marginBottom: 10 }} disabled={erBusy} onClick={berekenEigenKm}>
            {erBusy ? "Afstand meten…" : "Afstand meten"}
          </button>
          <div className="tm-fg">
            <label className="fl">Afstand (km)</label>
            <input type="number" min="1" step="1" placeholder="Bijvoorbeeld 36" value={erK} onChange={e => setErK(e.target.value)} />
          </div>
          <button type="button" className="btn btn-p btn-full" style={{ marginBottom: 14 }} onClick={addEigenRoute}>
            Route toevoegen
          </button>
          {(D.xr || []).length === 0 ? (
            <p className="tm-em" style={{ margin: 0 }}>Nog geen eigen routes. De standaardroutes blijven altijd beschikbaar.</p>
          ) : (
            <div className="tm-rows">
              {(D.xr || []).map(r => (
                <div key={r.id} className="tm-brow">
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {r.f} naar {r.t}
                  </span>
                  <span className="tm-num tm-muted">{r.k} km</span>
                  <button type="button" className="btn btn-gh" onClick={() => delEigenRoute(r.id)} aria-label={`Route ${r.f} naar ${r.t} verwijderen`}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="tm-meer-sec">
        <h2 className="tm-meer-sec-h">Bonnen inlezen</h2>
        <div className="card">
          <BonFotoImportSection D={D} sD={sD} pid={pid} />
        </div>
      </section>

      <section className="tm-meer-sec">
        <h2 className="tm-meer-sec-h">Tarieven</h2>
        <div className="card">
          {[
            { l: "Opstart per rit", v: "€15,00" },
            { l: "Per begonnen 20 km", v: "€25,00" },
            { l: "Nachttoeslag (20:00 tot 05:00)", v: "+30% op het aantal schijven van 20 km" },
            { l: "Forfait Sango of RKV Mechelen en UZA Edegem", v: "€35,00, zonder nachttoeslag" },
          ].map(r => (
            <div key={r.l} className="sep">
              <span className="lbl">{r.l}</span>
              <span className="val">{r.v}</span>
            </div>
          ))}
          <p className="tm-card-p" style={{ margin: "12px 0 0" }}>
            Voorbeeld: 45 km is 3 schijven, dus overdag €15 + €75 = €90. ’s Nachts wordt dat 4 schijven: €115.
          </p>
        </div>
      </section>

      <details className="tm-meer-sec tm-details">
        <summary className="tm-meer-sec-h">Onderhoud</summary>
        <div className="card">
          <div className="tm-card-t">Bedragen herberekenen</div>
          <p className="tm-card-p">
            Zet alle ritten van {pr.n} opnieuw op het huidige tarief. Ritten waarvan je km of bedrag zelf hebt aangepast blijven ongewijzigd.
          </p>
          <button
            type="button"
            className="btn btn-o btn-full"
            style={{ marginBottom: 8 }}
            disabled={herberekenTariefBusy || D.r.length === 0}
            onClick={herberekenVergoedingenLokaal}
          >
            {herberekenTariefBusy ? "Bezig…" : "Bedragen herberekenen"}
          </button>
          <button
            type="button"
            className="btn btn-o btn-full"
            style={{ marginBottom: 16 }}
            disabled={recalcRittenBusy || herberekenTariefBusy || D.r.length === 0}
            onClick={herberekenAlleRittenKm}
          >
            {recalcRittenBusy ? "Bezig met meten…" : "Afstanden opnieuw meten (internet nodig)"}
          </button>
          <div className="tm-card-t">Routedienst</div>
          <p className="tm-card-p">
            {googleMapsKey
              ? "Afstanden worden gemeten met Google Maps."
              : "Afstanden worden gemeten met de gratis routedienst. Die kan enkele kilometers afwijken."}
          </p>
          <button type="button" className="btn btn-o" disabled={googleTestBusy} onClick={testGoogleDirections}>
            {googleTestBusy ? "Bezig…" : "Routedienst testen"}
          </button>
          {googleTestMsg ? (
            <p className="tm-card-p" style={{ margin: "10px 0 0", color: googleTestMsg.startsWith("OK") ? "var(--gn)" : "var(--rd)" }}>
              {googleTestMsg}
            </p>
          ) : null}
        </div>
      </details>
    </div>
  );
}


export {
  PR,
  DR,
  CA,
  ld,
  sv,
  normData,
  applyTripAction,
  tmVergoeding,
  tmBuildMergedRoutes,
  parseLooseNumber,
  money,
  E,
  ritKmValue,
  td,
  toIsoLocal,
  iR,
  isN,
  ui,
  nt,
  fmtNlShort,
  initialProfileId,
  RitMap,
  Badge,
  RitVergoedingUitleg,
  VoltooiBonSheet,
  Historiek,
  Kosten,
  Meer,
};
