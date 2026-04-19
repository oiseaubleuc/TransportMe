import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Chart as ChartJS,
  ArcElement,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import { Doughnut, Bar, Line } from "react-chartjs-2";
import "./transportme-theme.css";
import { exportTransporteurData, applyImportPayload } from "./js/dataBackup.js";
import { recognizeBonImage, terminateBonOcrWorker } from "./js/bonFotoOcr.js";
import { getFactuurGegevens, nextFactuurVolgNummer, saveFactuurGegevens } from "./js/storage.js";
import { generateFactuurPdfBlob, triggerPdfDownload } from "./js/invoicePdf.js";
import { vergoedingVoorRit } from "./js/calculations.js";
import { getDrivingRouteKm, getDrivingRouteWithGeometry } from "./js/ors.js";
import { searchPlacesBelgium } from "./js/placeSearchFree.js";
import { PRESET_ANCHOR_ZIEKENHUIZEN, GESCHAT_VERBRUIK_L_PER_100KM, hasGoogleMapsApiKey } from "./js/config.js";
import ziekenVlaanderen from "./data/ziekenhuizen-vlaanderen.json";

ChartJS.register(
  ArcElement,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Filler,
  Tooltip,
  Legend
);
ChartJS.defaults.font.family = "'DM Sans', -apple-system, sans-serif";
ChartJS.defaults.color = "#a3a3a3";

/** Thema-olijfgroen (donkerder) — zelfde basis als --acc in transportme-theme.css */
const TM_ACC = "#6d8528";
const TM_ACC2 = "#556b1f";
const TM_GN = "#92a84a";
const tmAccRgba = a => `rgba(109, 133, 40, ${a})`;

/** Donut “Verdeling status”: elke categorie eigen kleur (niet allemaal groen). */
const TM_DONUT_STATUS_BG = [
  "rgba(56, 189, 248, 0.9)", // Gepland — hemelsblauw
  "rgba(251, 191, 36, 0.9)", // Onderweg — amber
  tmAccRgba(0.92), // Voltooid — themagroen
  "rgba(239, 68, 68, 0.82)", // Geannuleerd — rood
];

const TM_CHART_BASE = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: "bottom",
      labels: {
        color: "#9a9a92",
        boxWidth: 10,
        padding: 10,
        font: { size: 11 },
      },
    },
    tooltip: {
      backgroundColor: "#1c1c1c",
      titleColor: "#eeede8",
      bodyColor: "#b8b8b0",
      borderColor: "#2c2c2a",
      borderWidth: 1,
      padding: 10,
      cornerRadius: 8,
    },
  },
};

const PR = [
  { id: "houdaifa", n: "Houdaifa", i: "H" },
  { id: "amine", n: "Amine", i: "A" },
  { id: "frederik", n: "Frederik", i: "F" },
];
const DR = ["Houdaifa", "Amine", "Frederik", "Student 1"],
  CA = ["Audi A3 (2-HKN-136)", "BMW Serie 1 (2-GGW-635)"];
/** Vaste routes (km + coördinaten, zelfde lijst als voorheen — geen handmatige route) */
/** k = referentie-km (OSRM); live meting = Google Maps indien VITE_GOOGLE_MAPS_API_KEY, anders ORS/OSRM. */
const ROUTES = [
  { f: "UZ Brussel", t: "UZ Leuven", k: 36, la1: 50.8824, lo1: 4.2745, la2: 50.8814, lo2: 4.671 },
  { f: "UZ Brussel", t: "UZA Edegem", k: 41, la1: 50.8824, lo1: 4.2745, la2: 51.1552, lo2: 4.4452 },
  { f: "UZ Brussel", t: "AZ Deurne", k: 47, la1: 50.8824, lo1: 4.2745, la2: 51.2192, lo2: 4.4653 },
  { f: "UZ Brussel", t: "AZ Herentals", k: 74, la1: 50.8824, lo1: 4.2745, la2: 51.1766, lo2: 4.8325 },
  { f: "UZ Brussel", t: "RKV Mechelen", k: 31, la1: 50.8824, lo1: 4.2745, la2: 51.0257, lo2: 4.4776 },
  { f: "UZ Brussel", t: "AZ Gent", k: 49, la1: 50.8824, lo1: 4.2745, la2: 51.0225, lo2: 3.7108 },
  { f: "UZ Brussel", t: "ZOL Genk", k: 104, la1: 50.8824, lo1: 4.2745, la2: 50.9656, lo2: 5.5001 },
  { f: "UZ Brussel", t: "AZ Turnhout", k: 88, la1: 50.8824, lo1: 4.2745, la2: 51.3245, lo2: 4.9486 },
  { f: "UZ Brussel", t: "Virga Jesse", k: 92, la1: 50.8824, lo1: 4.2745, la2: 50.9307, lo2: 5.3378 },
  { f: "RKV Mechelen", t: "AZ Gent", k: 78, la1: 51.0257, lo1: 4.4776, la2: 51.0225, lo2: 3.7108 },
  { f: "RKV Mechelen", t: "ZOL Genk", k: 90, la1: 51.0257, lo1: 4.4776, la2: 50.9656, lo2: 5.5001 },
  { f: "RKV Mechelen", t: "UZ Leuven", k: 39, la1: 51.0257, lo1: 4.4776, la2: 50.8814, lo2: 4.671 },
  { f: "RKV Mechelen", t: "UZ Brussel", k: 32, la1: 51.0257, lo1: 4.4776, la2: 50.8824, lo2: 4.2745 },
  { f: "RKV Mechelen", t: "Jessa Hasselt", k: 77, la1: 51.0257, lo1: 4.4776, la2: 50.9307, lo2: 5.3378 },
  { f: "RKV Mechelen", t: "Heusden-Zolder St. Franciscus (SFZ)", k: 78, la1: 51.0257, lo1: 4.4776, la2: 51.047, lo2: 5.3153 },
  { f: "RKV Mechelen", t: "Lier Heilig Hart", k: 16, la1: 51.0257, lo1: 4.4776, la2: 51.1284, lo2: 4.5708 },
  { f: "RKV Mechelen", t: "Malle AZ Voorkempen", k: 51, la1: 51.0257, lo1: 4.4776, la2: 51.2995, lo2: 4.7295 },
  { f: "RKV Mechelen", t: "Turnhout St. Elisabeth", k: 64, la1: 51.0257, lo1: 4.4776, la2: 51.321, lo2: 4.936 },
  { f: "RKV Mechelen", t: "Sint-Truiden AZ St. Trudo", k: 78, la1: 51.0257, lo1: 4.4776, la2: 50.8165, lo2: 5.1895 },
  { f: "RKV Mechelen", t: "Gent UZ", k: 78, la1: 51.0257, lo1: 4.4776, la2: 51.0361, lo2: 3.7284 },
  { f: "RKV Mechelen", t: "Geel St. Dimpna", k: 65, la1: 51.0257, lo1: 4.4776, la2: 51.1622, lo2: 4.9938 },
  { f: "RKV Mechelen", t: "Deurne AZ Monica", k: 26, la1: 51.0257, lo1: 4.4776, la2: 51.2192, lo2: 4.4653 },
  { f: "RKV Mechelen", t: "Bornem AZ Rivierenland", k: 22, la1: 51.0257, lo1: 4.4776, la2: 51.091, lo2: 4.24 },
  { f: "RKV Mechelen", t: "Brasschaat AZ Klina", k: 37, la1: 51.0257, lo1: 4.4776, la2: 51.2912, lo2: 4.4918 },
  { f: "UZ Leuven", t: "UZ Brussel", k: 35, la1: 50.8814, lo1: 4.671, la2: 50.8824, lo2: 4.2745 },
  { f: "UZ Leuven", t: "UZA Edegem", k: 52, la1: 50.8814, lo1: 4.671, la2: 51.1552, lo2: 4.4452 },
  { f: "UZ Leuven", t: "AZ Diest", k: 36, la1: 50.8814, lo1: 4.671, la2: 50.9894, lo2: 5.0506 },
];

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
/** Totalen op Home/Financieel: alleen data vanaf deze datum (YYYY-MM-DD). */
const TM_STATS_FROM = "2026-03-31";
const statsVenster = d => typeof d === "string" && d.slice(0, 10) >= TM_STATS_FROM;
const gr = p => {
  if (p === "day") return [td(), td()];
  if (p === "yesterday") return [yd(), yd()];
  if (p === "week") return wk();
  return mo();
};
const grExt = p => (p === "all" ? ["1970-01-01", "2099-12-31"] : gr(p));

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

/** getallen uit oude data (1.234,56 of 90,50 of 90.5) */
function parseLooseNumber(val) {
  if (val == null || val === "") return NaN;
  if (typeof val === "number" && Number.isFinite(val)) return val;
  const s0 = String(val).trim().replace(/\s/g, "");
  const hasComma = s0.includes(",");
  const hasDot = s0.includes(".");
  let s = s0;
  if (hasComma && (!hasDot || s0.lastIndexOf(",") > s0.lastIndexOf("."))) {
    s = s0.replace(/\./g, "").replace(",", ".");
  } else if (hasComma && hasDot) {
    s = s0.replace(/,/g, "");
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

const TM_AUTO_FIX_CALC_VERSION = "tm_auto_fix_calc_v2";
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
    if (opts && Object.prototype.hasOwnProperty.call(opts, "bon")) {
      const t = String(opts.bon ?? "").trim();
      const next = { ...cur, s: "voltooid" };
      if (t) next.bon = t;
      else delete next.bon;
      rr[i] = next;
    } else rr[i] = { ...cur, s: "voltooid" };
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
          <h2>Bon</h2>
          <button type="button" className="btn btn-gh" onClick={onAnnuleer} aria-label="Sluiten">
            ✕
          </button>
        </div>
        <div className="tm-mb">
          <div className="tm-fg">
            <label className="fl">IHcT / bonnummer</label>
            <input
              type="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="IHcT… of meerdere, gescheiden door komma"
              value={bon}
              onChange={e => setBon(e.target.value)}
            />
            <p style={{ fontSize: 11, color: "var(--tx3)", margin: "6px 0 0", lineHeight: 1.35 }}>
              Meerdere bonnen voor dezelfde rit? Scheid met komma, puntkomma of nieuwe regel — factuur en CSV maken dan
              één regel per bon (bedrag verdeeld).
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
              Voltooien
            </button>
            <button type="button" className="btn btn-gh btn-full" onClick={onAnnuleer}>
              Annuleren
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
    if (!el.current) return;
    const map = L.map(el.current, { zoomControl: true });
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
    let cancelled = false;
    getDrivingRouteWithGeometry({ lat: la1, lng: lo1 }, { lat: la2, lng: lo2 })
      .then(({ geometry }) => {
        if (cancelled || !geometry?.length) return;
        map.removeLayer(routeLayer);
        const latlngs = geometry.map(([lng, lat]) => [lat, lng]);
        routeLayer = L.polyline(latlngs, { color: TM_ACC, weight: 4, opacity: 0.92 }).addTo(map);
        map.fitBounds(routeLayer.getBounds(), { padding: [36, 36], maxZoom: 11 });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      map.remove();
    };
  }, [la1, lo1, la2, lo2, labelF, labelT]);
  return <div className="tm-rit-map" ref={el} role="presentation" />;
}

function PP({ v, set }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
      {[
        ["day", "Dag"],
        ["week", "Week"],
        ["month", "Maand"],
      ].map(([k, l]) => (
        <button key={k} type="button" className={"btn " + (v === k ? "btn-p" : "btn-o")} onClick={() => set(k)}>
          {l}
        </button>
      ))}
    </div>
  );
}

/** Vandaag / deze week — dropdown zoals een periodeselector in een dashboard. */
function HomeSumPeriodSelect({ v, set }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const labels = { day: "Vandaag", yesterday: "Gisteren", week: "Deze week" };

  useEffect(() => {
    const close = ev => {
      if (wrapRef.current && !wrapRef.current.contains(ev.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = e => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="tm-home-sum-dd" ref={wrapRef}>
      <button
        type="button"
        className="tm-home-sum-dd-btn"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Periode kiezen"
        onClick={() => setOpen(o => !o)}
      >
        <span>{labels[v] ?? "Vandaag"}</span>
        <span className="tm-home-sum-dd-chev" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <ul className="tm-home-sum-dd-menu" role="listbox">
          {[
            ["day", "Vandaag"],
            ["yesterday", "Gisteren"],
            ["week", "Deze week"],
          ].map(([k, l]) => (
            <li key={k} role="none">
              <button
                type="button"
                role="option"
                aria-selected={v === k}
                className={"tm-home-sum-dd-opt" + (v === k ? " on" : "")}
                onClick={() => {
                  set(k);
                  setOpen(false);
                }}
              >
                {l}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function statCard(label, value, color, sub) {
  return (
    <div className="stat-card" style={{ borderTopColor: color }}>
      <div className="sc-l">{label}</div>
      <div className="sc-v" style={{ color }}>
        {value}
      </div>
      {sub ? <div className="sc-s">{sub}</div> : null}
    </div>
  );
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

function TripCard({ r, onAct }) {
  const bc = r.s === "komend" ? "cl-a" : r.s === "lopend" ? "cl-g" : r.s === "geannuleerd" ? "cl-r" : "cl-v";
  const cardStyle = { opacity: r.s === "geannuleerd" ? 0.45 : 1 };
  const inner = (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>
          {r.f} → {r.t}
        </span>
        <Badge s={r.s} />
      </div>
      <div className="tm-trip-meta">
        {r.d}
        {r.ti && " · " + r.ti}
        {r.bon && " · Bon " + r.bon} · {r.k} km · <strong className="acc">{E(r.v)}</strong>
      </div>
      {isN(r.ti) && r.s !== "geannuleerd" && (
        <div style={{ fontSize: 11, color: "var(--am)", marginBottom: 2 }}>Nachttarief +30%</div>
      )}
      {r.dr && (
        <div style={{ fontSize: 11, color: "var(--tx3)", marginBottom: 6 }}>
          {r.dr} · {r.ca}
        </div>
      )}
      {(r.pr || r.wc || r.deur || r.bag) && (
        <div className="tm-rdw">
          {r.pr && (
            <span className="tm-rd">
              {r.pr === "kritiek" ? "Kritiek" : r.pr === "dringend" ? "Dringend" : "Normaal"}
            </span>
          )}
          {r.wc && <span className="tm-rd">Rolstoel</span>}
          {r.deur && <span className="tm-rd">Deur</span>}
          {r.bag && <span className="tm-rd">Bagage</span>}
        </div>
      )}
      {(r.pc || r.tel || r.nt) && (
        <div className="tm-rnt">
          {r.pc && <small>Contact: {r.pc}</small>}
          {r.tel && <small>Tel: {r.tel}</small>}
          {r.nt && <small>Notitie: {r.nt}</small>}
        </div>
      )}
      {onAct && (
        <div className="tm-trip-actions">
          {r.s === "komend" && (
            <>
              <button type="button" className="btn btn-p" onClick={() => onAct(r.id, "go")}>
                ▶ Start
              </button>
              <button type="button" className="btn btn-s" onClick={() => onAct(r.id, "ok")}>
                ✓ Klaar
              </button>
              <button
                type="button"
                className="btn btn-gh"
                onClick={() => onAct(r.id, "no")}
                title="Rit verwijderen — telt niet in totalen of grafieken"
              >
                Annuleer
              </button>
            </>
          )}
          {r.s === "lopend" && (
            <>
              <button type="button" className="btn btn-g" onClick={() => onAct(r.id, "ok")}>
                ✓ Klaar
              </button>
              <button
                type="button"
                className="btn btn-gh"
                onClick={() => onAct(r.id, "no")}
                title="Rit verwijderen — telt niet in totalen of grafieken"
              >
                Annuleer
              </button>
            </>
          )}
          <button
            type="button"
            className="btn btn-gh"
            style={{ color: "var(--rd)", marginLeft: "auto" }}
            title="Rit permanent verwijderen"
            onClick={() => onAct(r.id, "x")}
          >
            ✕
          </button>
        </div>
      )}
      {r.s === "lopend" && onAct && (
        <p className="tm-trip-swipe-hint">Veeg → voltooien · ← annuleren</p>
      )}
    </>
  );

  if (r.s === "lopend" && onAct) {
    return (
      <LopendTripSwipe ritId={r.id} onAct={onAct} className={"card card-l " + bc} style={cardStyle}>
        {inner}
      </LopendTripSwipe>
    );
  }

  return (
    <div className={"card card-l " + bc} style={{ ...cardStyle, marginBottom: 8 }}>
      {inner}
    </div>
  );
}

function Home({ D, pr, onPlanRit, onTripAct }) {
  const [sumP, setSumP] = useState("day");
  const [s, e] = gr(sumP);
  const vl = D.r.filter(r => r.s === "voltooid" && statsVenster(r.d) && iR(r.d, s, e));
  const homeOmzetLine = useMemo(() => {
    const border = TM_ACC;
    const fill = tmAccRgba(0.22);
    if (sumP === "week") {
      const days = eachDayInclusive(s, e);
      const labels = days.map(day => {
        const dt = new Date(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
        dt.setHours(12, 0, 0, 0);
        return dt.toLocaleDateString("nl-BE", { weekday: "short", day: "numeric" });
      });
      const data = days.map(day => vl.filter(r => r.d === day).reduce((a, r) => a + money(r.v), 0));
      return {
        labels,
        datasets: [
          {
            label: "Omzet",
            data,
            borderColor: border,
            backgroundColor: fill,
            fill: true,
            tension: 0.35,
            pointRadius: 3,
            pointHoverRadius: 5,
            pointBackgroundColor: border,
            borderWidth: 2,
          },
        ],
      };
    }
    const sorted = [...vl].sort((a, b) => (a.d + (a.ti || "")).localeCompare(b.d + (b.ti || "")));
    if (sorted.length === 0) {
      return {
        labels: ["—"],
        datasets: [
          {
            label: "Omzet",
            data: [0],
            borderColor: border,
            backgroundColor: fill,
            fill: true,
            tension: 0.25,
            pointRadius: 0,
            borderWidth: 2,
          },
        ],
      };
    }
    let cum = 0;
    const data = sorted.map(r => {
      cum += money(r.v);
      return cum;
    });
    const labels = sorted.map((r, i) => (sorted.length <= 10 ? r.ti || `Rit ${i + 1}` : String(i + 1)));
    return {
      labels,
      datasets: [
        {
          label: "Omzet",
          data,
          borderColor: border,
          backgroundColor: fill,
          fill: true,
          tension: 0.35,
          pointRadius: Math.min(4, Math.max(2, 12 - sorted.length)),
          pointHoverRadius: 6,
          pointBackgroundColor: border,
          borderWidth: 2,
        },
      ],
    };
  }, [sumP, s, e, D.r]);
  const homeLineOpts = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: "index" },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...TM_CHART_BASE.plugins.tooltip,
          callbacks: {
            label: ctx => "Omzet " + E(Number(ctx.parsed.y ?? ctx.raw) || 0),
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#8a8a82",
            maxRotation: sumP === "week" ? 0 : 45,
            font: { size: 10 },
          },
          grid: { color: "rgba(60, 60, 60, 0.35)" },
        },
        y: {
          ticks: {
            color: "#8a8a82",
            font: { size: 10 },
            callback: v => "€" + v,
          },
          grid: { color: "rgba(60, 60, 60, 0.4)" },
          beginAtZero: true,
        },
      },
    }),
    [sumP]
  );
  const om = vl.reduce((a, r) => a + money(r.v), 0);
  const km = vl.reduce((a, r) => a + Number(r.k) || 0, 0);
  const kosten =
    D.b.filter(b => statsVenster(b.d) && iR(b.d, s, e)).reduce((a, b) => a + money(b.a), 0) +
    (D.o || []).filter(x => statsVenster(x.d) && iR(x.d, s, e)).reduce((a, x) => a + money(x.a), 0);
  const nettoBoek = om - kosten;
  const tanksInPeriode = D.b.filter(b => statsVenster(b.d) && iR(b.d, s, e));
  const tanksMetL = tanksInPeriode.filter(b => money(b.l) > 0 && money(b.p) >= 0);
  const avgPl = tanksMetL.length
    ? tanksMetL.reduce((a, b) => a + money(b.p), 0) / tanksMetL.length
    : 2.3;
  const geschatBrandstofRitten =
    Math.round(km * (GESCHAT_VERBRUIK_L_PER_100KM / 100) * avgPl * 100) / 100;
  const geschatWinst = Math.round((om - geschatBrandstofRitten) * 100) / 100;
  const periodRangeLabel =
    sumP === "day"
      ? fmtNlVandaagLong()
      : sumP === "yesterday"
        ? fmtNlLongFromIso(s)
        : `${fmtNlShort(s)} t/m ${fmtNlShort(e)}`;
  const nettoHint =
    sumP === "day"
      ? "Na alle kosten vandaag"
      : sumP === "yesterday"
        ? "Na alle kosten gisteren"
        : "Na alle kosten deze week";
  const lopend = D.r
    .filter(r => r.s === "lopend")
    .sort((a, b) => (a.d + (a.ti || "")).localeCompare(b.d + (b.ti || "")));
  const komend = D.r
    .filter(r => r.s === "komend")
    .sort((a, b) => (a.d + (a.ti || "")).localeCompare(b.d + (b.ti || "")));
  const heeftRitten = lopend.length > 0 || komend.length > 0;

  return (
    <div className="tm-home-page">
      <header className="tm-home-hello">
        <div className="tm-home-hello-sub">Welkom terug</div>
        <h1 className="tm-home-hello-name">{pr.n}</h1>
      </header>

      {heeftRitten && (
        <section className="tm-home-ritten" aria-label="Actieve en geplande ritten">
          {lopend.length > 0 && (
            <div className="tm-home-onderweg">
              <div className="tm-home-onderweg-hd">
                <span className="tm-home-onderweg-pulse" aria-hidden="true" />
                <span>Nu onderweg</span>
                <span className="tm-home-onderweg-c">{lopend.length}</span>
              </div>
              <p className="tm-home-onderweg-lead">
                Start, voltooien of annuleren hieronder. Annuleren verwijdert de rit (telt niet mee).
              </p>
              {lopend.map(r => (
                <TripCard key={r.id} r={r} onAct={onTripAct} />
              ))}
            </div>
          )}
          {komend.length > 0 && (
            <div className={lopend.length > 0 ? "tm-home-gepland" : undefined}>
              <div className="sh">
                Gepland <span className="sh-c">{komend.length}</span>
              </div>
              {komend.slice(0, 6).map(r => (
                <TripCard key={r.id} r={r} onAct={onTripAct} />
              ))}
            </div>
          )}
        </section>
      )}

      <section className="tm-home-sum" aria-label="Omzetoverzicht">
        <header className="tm-home-sum-head">
          <h2 className="tm-home-sum-title">Omzetoverzicht</h2>
          <HomeSumPeriodSelect v={sumP} set={setSumP} />
        </header>
        <p className="tm-home-sum-range">{periodRangeLabel}</p>
        <div className="tm-home-sum-body">
          <div className="tm-home-sum-hero">
            <div className="tm-home-sum-hero-inner">
              <span className="tm-home-sum-hero-lab">Omzet</span>
              <span className="tm-home-sum-hero-val tm-home-sum-hero-val--acc">{E(om)}</span>
              <div
                className="tm-home-sum-line-wrap"
                role="img"
                aria-label={
                  sumP === "week"
                    ? "Omzet per dag in de gekozen week"
                    : sumP === "yesterday"
                      ? "Cumulatieve omzet per rit op gisteren"
                      : "Cumulatieve omzet per rit vandaag"
                }
              >
                <Line data={homeOmzetLine} options={homeLineOpts} />
              </div>
              <span className="tm-home-sum-hero-sub">Alleen voltooide ritten in deze periode</span>
            </div>
          </div>
          <div className="tm-home-sum-split">
            <div className="tm-home-sum-cell">
              <span className="tm-home-sum-cell-lab">Winst</span>
              <span className="tm-home-sum-cell-hint">Na geschatte brandstof</span>
              <span
                className={
                  "tm-home-sum-cell-val " + (geschatWinst >= 0 ? "tm-home-stat-pos" : "tm-home-stat-neg")
                }
              >
                {E(geschatWinst)}
              </span>
            </div>
            <div className="tm-home-sum-cell">
              <span className="tm-home-sum-cell-lab">Netto</span>
              <span className="tm-home-sum-cell-hint">{nettoHint}</span>
              <span
                className={
                  "tm-home-sum-cell-val " + (nettoBoek >= 0 ? "tm-home-stat-pos" : "tm-home-stat-neg")
                }
              >
                {E(nettoBoek)}
              </span>
            </div>
          </div>
        </div>
      </section>

      <button type="button" className="btn btn-p btn-full tm-home-plan" onClick={onPlanRit}>
        Rit plannen
      </button>
    </div>
  );
}

function ritWeekBuckets(rides) {
  const voltooid = rides.filter(r => r.s === "voltooid");
  const labels = [];
  const counts = [];
  const kms = [];
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const wkLbl = ["≈ 6 wk geleden", "≈ 5 wk", "≈ 4 wk", "≈ 3 wk", "≈ 2 wk", "Deze week"];
  for (let w = 5; w >= 0; w--) {
    const periodEnd = new Date(today);
    periodEnd.setDate(periodEnd.getDate() - w * 7);
    const periodStart = new Date(periodEnd);
    periodStart.setDate(periodStart.getDate() - 6);
    const s = toIsoLocal(periodStart);
    const e = toIsoLocal(periodEnd);
    let c = 0,
      k = 0;
    voltooid.forEach(r => {
      if (r.d >= s && r.d <= e) {
        c++;
        k += Number(r.k) || 0;
      }
    });
    labels.push(wkLbl[5 - w]);
    counts.push(c);
    kms.push(k);
  }
  return { labels, counts, kms };
}

function RittenOverzichtCharts({ rides, cnt, onDrill }) {
  const week = useMemo(() => ritWeekBuckets(rides), [rides]);
  const donut = useMemo(
    () => ({
      labels: ["Gepland", "Onderweg", "Voltooid", "Geannuleerd"],
      datasets: [
        {
          data: [cnt.komend, cnt.lopend, cnt.voltooid, cnt.geannuleerd],
          backgroundColor: [...TM_DONUT_STATUS_BG],
          borderColor: "#141414",
          borderWidth: 2,
          hoverOffset: 8,
        },
      ],
    }),
    [cnt]
  );
  const barWeek = useMemo(
    () => ({
      labels: week.labels,
      datasets: [
        {
          label: "Voltooid",
          data: week.counts,
          backgroundColor: tmAccRgba(0.45),
          borderColor: TM_ACC,
          borderWidth: 1,
          borderRadius: 6,
        },
      ],
    }),
    [week]
  );
  const barWeekOpts = useMemo(
    () => ({
      ...TM_CHART_BASE,
      scales: {
        x: {
          ticks: { color: "#6f6f68", maxRotation: 40, font: { size: 10 } },
          grid: { color: "rgba(40,40,40,0.45)" },
        },
        y: {
          ticks: { color: "#6f6f68", stepSize: 1 },
          grid: { color: "rgba(40,40,40,0.5)" },
          beginAtZero: true,
        },
      },
      plugins: {
        ...TM_CHART_BASE.plugins,
        tooltip: {
          ...TM_CHART_BASE.plugins.tooltip,
          callbacks: {
            afterBody: items => {
              const i = items[0]?.dataIndex;
              if (i == null) return "";
              return `${week.kms[i]} km in deze periode`;
            },
          },
        },
      },
    }),
    [week]
  );
  const topRoutes = useMemo(() => {
    const m = {};
    rides
      .filter(r => r.s === "voltooid")
      .forEach(r => {
        const key = `${r.f} → ${r.t}`;
        m[key] = (m[key] || 0) + 1;
      });
    return Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [rides]);
  const barTop = useMemo(
    () => ({
      labels: topRoutes.map(([k]) => (k.length > 32 ? k.slice(0, 30) + "…" : k)),
      datasets: [
        {
          label: "Ritten",
          data: topRoutes.map(([, v]) => v),
          backgroundColor: tmAccRgba(0.35),
          borderColor: TM_ACC2,
          borderWidth: 1,
          borderRadius: 4,
        },
      ],
    }),
    [topRoutes]
  );
  const barTopOpts = useMemo(
    () => ({
      ...TM_CHART_BASE,
      indexAxis: "y",
      scales: {
        x: {
          ticks: { color: "#6f6f68", stepSize: 1 },
          grid: { color: "rgba(40,40,40,0.45)" },
          beginAtZero: true,
        },
        y: {
          ticks: { color: "#9a9a92", font: { size: 9 } },
          grid: { display: false },
        },
      },
    }),
    []
  );
  const donutOpts = useMemo(
    () => ({
      ...TM_CHART_BASE,
      cutout: "62%",
      plugins: {
        ...TM_CHART_BASE.plugins,
        legend: { ...TM_CHART_BASE.plugins.legend, position: "bottom" },
      },
    }),
    []
  );

  if (rides.length === 0) {
    return (
      <p className="tm-em" style={{ marginTop: 8 }}>
        Nog geen ritten — plan er een of schakel naar de lijst.
      </p>
    );
  }

  return (
    <div className="tm-ritten-charts">
      <p className="tm-chart-lead">
        <strong>{rides.length}</strong> ritten in totaal. Weekbalk = voltooide ritten per kalenderweek (lokale datum).
        Open de lijst via een filter hieronder.
      </p>
      <div className="tm-chart-grid">
        <div className="tm-chart-card tm-chart-card--donut">
          <div className="tm-chart-hd">Verdeling status</div>
          <div className="tm-chart-body tm-chart-body--donut">
            <Doughnut data={donut} options={donutOpts} />
          </div>
        </div>
        <div className="tm-chart-card">
          <div className="tm-chart-hd">Voltooide ritten (per week)</div>
          <div className="tm-chart-body tm-chart-body--bar">
            <Bar data={barWeek} options={barWeekOpts} />
          </div>
        </div>
        {topRoutes.length > 0 && (
          <div className="tm-chart-card tm-chart-card--wide">
            <div className="tm-chart-hd">Toproutes (voltooid)</div>
            <div className="tm-chart-body tm-chart-body--hbar">
              <Bar data={barTop} options={barTopOpts} />
            </div>
          </div>
        )}
      </div>
      <div className="tm-ritten-drill">
        <div className="fl" style={{ marginBottom: 8 }}>
          Open lijst met filter
        </div>
        <div className="tm-cg">
          {[
            ["alle", "Alle"],
            ["komend", "Gepland"],
            ["lopend", "Onderweg"],
            ["voltooid", "Voltooid"],
            ["geannuleerd", "Geannuleerd"],
          ].map(([k, l]) => (
            <button key={k} type="button" className="tm-ci" onClick={() => onDrill(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Ritten({ D, sD, pid, onTripAct, openNieuwRequest = 0 }) {
  const [fl, sF] = useState("alle");
  const [pane, sPane] = useState("overzicht");
  const [sh, sSh] = useState(false);
  const lastNieuwReq = useRef(0);
  const mergedRoutes = useMemo(() => tmBuildMergedRoutes(D), [D.xr, D.xrArch]);
  const mkIni = () => ({
    ri: -1,
    f: "",
    t: "",
    k: "",
    bon: "",
    d: td(),
    ti: nt(),
    dr: DR[0],
    ca: CA[0],
    s: "komend",
  });
  const [fm, sM] = useState(mkIni);
  const [routeKmLaden, setRouteKmLaden] = useState(false);
  const routeKmReq = useRef(0);
  const pk = i => {
    const r = mergedRoutes[i];
    if (!r) return;
    const token = ++routeKmReq.current;
    sM(m => ({ ...m, ri: i, f: r.f, t: r.t, k: String(r.k) }));
    if (r.la1 != null && r.la2 != null && r.lo1 != null && r.lo2 != null && Number.isFinite(Number(r.la1))) {
      setRouteKmLaden(true);
      getDrivingRouteKm({ lat: r.la1, lng: r.lo1 }, { lat: r.la2, lng: r.lo2 })
        .then(({ km }) => {
          if (token !== routeKmReq.current || km < 1) return;
          sM(m => (m.ri === i ? { ...m, k: String(km) } : m));
        })
        .catch(() => {})
        .finally(() => {
          if (token === routeKmReq.current) setRouteKmLaden(false);
        });
    } else {
      setRouteKmLaden(false);
    }
  };
  const svR = () => {
    if (!fm.f || !fm.t || !fm.k) return;
    const k = +fm.k;
    if (k <= 0) return;
    const trip = {
      id: ui(),
      d: fm.d,
      ti: fm.ti,
      f: fm.f,
      t: fm.t,
      k,
      dr: fm.dr,
      ca: fm.ca,
      s: fm.s,
      v: tmVergoeding(fm.f, fm.t, k, fm.ti),
    };
    const b = String(fm.bon || "").trim();
    if (b) trip.bon = b;
    const nd = normData({ ...D, r: [...D.r, trip] });
    sD(nd);
    sv(pid, nd);
    sM(mkIni());
    sSh(false);
  };
  const canBevestig = !!(fm.f && fm.t && fm.k && +fm.k > 0);
  const openNieuw = () => {
    sM(mkIni());
    sSh(true);
  };

  useEffect(() => {
    if (openNieuwRequest > 0 && openNieuwRequest !== lastNieuwReq.current) {
      lastNieuwReq.current = openNieuwRequest;
      sM(mkIni());
      sSh(true);
    }
  }, [openNieuwRequest]);

  const sel = fm.ri >= 0 ? mergedRoutes[fm.ri] : null;
  const mapCoords =
    sel && sel.__map
      ? { la1: sel.la1, lo1: sel.lo1, la2: sel.la2, lo2: sel.lo2, labelF: sel.f, labelT: sel.t }
      : null;

  const act = onTripAct;
  const cnt = useMemo(() => {
    const c = { alle: D.r.length, komend: 0, lopend: 0, voltooid: 0, geannuleerd: 0 };
    D.r.forEach(r => {
      if (c[r.s] != null) c[r.s]++;
    });
    return c;
  }, [D.r]);
  const ls = useMemo(() => {
    let r = D.r;
    if (fl !== "alle") r = r.filter(x => x.s === fl);
    return r.sort((a, b) => (b.d + (b.ti || "")).localeCompare(a.d + (a.ti || "")));
  }, [D.r, fl]);

  const drill = k => {
    sF(k);
    sPane("lijst");
  };

  return (
    <div>
      <div className="tm-bar">
        <h1>Mijn ritten</h1>
        <button type="button" className="btn btn-p btn-pill" onClick={openNieuw}>
          + Nieuw
        </button>
      </div>
      <div className="tm-view-toggle" role="tablist" aria-label="Weergave ritten">
        <button
          type="button"
          role="tab"
          aria-selected={pane === "overzicht"}
          className={"tm-view-tab" + (pane === "overzicht" ? " on" : "")}
          onClick={() => sPane("overzicht")}
        >
          Overzicht
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={pane === "lijst"}
          className={"tm-view-tab" + (pane === "lijst" ? " on" : "")}
          onClick={() => sPane("lijst")}
        >
          Lijst
        </button>
      </div>
      {pane === "overzicht" ? (
        <RittenOverzichtCharts rides={D.r} cnt={cnt} onDrill={drill} />
      ) : (
        <>
          <div className="tm-sg2">
            {[
              ["komend", "Gepland"],
              ["lopend", "Onderweg"],
              ["voltooid", "Voltooid"],
            ].map(([k, l]) => (
              <button
                key={k}
                type="button"
                className={"tm-si" + (fl === k ? " on" : "")}
                onClick={() => sF(f => (f === k ? "alle" : k))}
              >
                <b>{cnt[k]}</b>
                <small>{l}</small>
              </button>
            ))}
          </div>
          <div className="tm-cg">
            {["alle", "komend", "lopend", "voltooid", "geannuleerd"].map(f => (
              <button key={f} type="button" className={"tm-ci" + (fl === f ? " on" : "")} onClick={() => sF(f)}>
                {f === "alle" ? "Alle" : f[0].toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          {ls.length === 0 && <p className="tm-em">Nog geen ritten.</p>}
          {ls.map(r => (
            <TripCard key={r.id} r={r} onAct={act} />
          ))}
        </>
      )}

      {sh && (
        <div className="tm-ov" onClick={e => e.target === e.currentTarget && sSh(false)}>
          <div className="tm-mo" onClick={e => e.stopPropagation()}>
            <div className="tm-mh">
              <h2>Nieuwe rit</h2>
              <button type="button" className="btn btn-gh" onClick={() => sSh(false)}>
                ✕
              </button>
            </div>
            <div className="tm-mb">
              <div className="tm-rit-map-slot tm-rit-map-slot--compact">
                {mapCoords ? (
                  <RitMap
                    la1={mapCoords.la1}
                    lo1={mapCoords.lo1}
                    la2={mapCoords.la2}
                    lo2={mapCoords.lo2}
                    labelF={mapCoords.labelF}
                    labelT={mapCoords.labelT}
                  />
                ) : fm.ri >= 0 && sel && !sel.__map ? (
                  <div className="tm-rit-map-ph">Geen kaart voor deze route.</div>
                ) : (
                  <div className="tm-rit-map-ph">Kies route ↓</div>
                )}
              </div>
              <div className="fl">Vaste routes</div>
              <div className="tm-prs tm-prs--modal">
                {mergedRoutes.map((r, i) => (
                  <button
                    key={r.__id ? `xr-${r.__id}` : r.__arch ? `ar-${r.id}` : `rt-${i}`}
                    type="button"
                    className={"tm-pr" + (fm.ri === i ? " on" : "")}
                    onClick={() => pk(i)}
                  >
                    <span>
                      {r.f} → {r.t}
                      {r.__id && !r.__arch && (
                        <span style={{ fontSize: 9, color: "var(--acc)", marginLeft: 6 }}>(eigen)</span>
                      )}
                      {r.__arch && (
                        <span style={{ fontSize: 9, color: "var(--am)", marginLeft: 6 }}>(archief)</span>
                      )}
                    </span>
                    <b className="tm-pk">{r.k} km</b>
                  </button>
                ))}
              </div>
              <div className="fl" style={{ marginTop: 10 }}>
                Handmatig
              </div>
              <div className="tm-g2">
                <div className="tm-fg">
                  <label className="fl">Vertrek (naam)</label>
                  <input
                    type="text"
                    placeholder="Bv. UZ Brussel"
                    value={fm.f}
                    onChange={e => sM(m => ({ ...m, f: e.target.value, ri: -1 }))}
                  />
                </div>
                <div className="tm-fg">
                  <label className="fl">Bestemming (naam)</label>
                  <input
                    type="text"
                    placeholder="Bv. UZ Leuven"
                    value={fm.t}
                    onChange={e => sM(m => ({ ...m, t: e.target.value, ri: -1 }))}
                  />
                </div>
              </div>
              <div className="tm-fg">
                <label className="fl">Afstand (km)</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Km"
                  value={fm.k}
                  onChange={e => sM(m => ({ ...m, k: e.target.value, ri: -1 }))}
                />
                {routeKmLaden && (
                  <p style={{ fontSize: 11, color: "var(--acc)", margin: "6px 0 0", lineHeight: 1.35 }}>
                    Rijroute wordt gemeten (kan even duren)…
                  </p>
                )}
              </div>
              <div className="tm-fg" style={{ marginTop: 10 }}>
                <label className="fl">Bon (IHcT…)</label>
                <input
                  type="text"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="Optioneel"
                  value={fm.bon}
                  onChange={e => sM(m => ({ ...m, bon: e.target.value }))}
                />
              </div>
              <div className="tm-g2">
                <div className="tm-fg">
                  <label className="fl">Datum</label>
                  <input type="date" value={fm.d} onChange={e => sM(m => ({ ...m, d: e.target.value }))} />
                </div>
                <div className="tm-fg">
                  <label className="fl">Tijd</label>
                  <input type="time" value={fm.ti} onChange={e => sM(m => ({ ...m, ti: e.target.value }))} />
                </div>
              </div>
              <div className="tm-g2">
                <div className="tm-fg">
                  <label className="fl">Chauffeur</label>
                  <select value={fm.dr} onChange={e => sM(m => ({ ...m, dr: e.target.value }))}>
                    {DR.map(d => (
                      <option key={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="tm-fg">
                  <label className="fl">Voertuig</label>
                  <select value={fm.ca} onChange={e => sM(m => ({ ...m, ca: e.target.value }))}>
                    {CA.map(c => (
                      <option key={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {canBevestig && (
                <div className="card tm-rit-sum">
                  <div className="tm-rvi">
                    <span>Route</span>
                    <b>
                      {fm.f} → {fm.t}
                    </b>
                  </div>
                  <div className="tm-rvi">
                    <span>Afstand</span>
                    <b>{fm.k} km</b>
                  </div>
                  <div className="tm-rvi">
                    <span>Vergoeding</span>
                    <b>
                      {E(tmVergoeding(fm.f, fm.t, +fm.k, fm.ti))}
                      {isN(fm.ti) && (
                        <span style={{ fontSize: 12, color: "var(--am)", fontWeight: 500 }}> nachttarief</span>
                      )}
                    </b>
                  </div>
                </div>
              )}
              <div className="tm-mfa tm-mfa-single">
                <button type="button" className="btn btn-p btn-full" onClick={svR} disabled={!canBevestig}>
                  Rit bevestigen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Financieel({ D, pid }) {
  const [p, sP] = useState("month");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [s, e] = gr(p);
  const [factuurVan, setFactuurVan] = useState(s);
  const [factuurTot, setFactuurTot] = useState(e);
  const all = D.r;

  useEffect(() => {
    setFactuurVan(s);
    setFactuurTot(e);
  }, [p, s, e]);

  const [fs, fe] = useMemo(
    () => normFactuurDatumRange(factuurVan, factuurTot, s, e),
    [factuurVan, factuurTot, s, e]
  );

  const done = all.filter(r => r.s === "voltooid" && iR(r.d, s, e));
  const cancelled = all.filter(r => r.s === "geannuleerd" && iR(r.d, s, e));
  const omzet = done.reduce((a, r) => a + money(r.v), 0);
  const totKm = done.reduce((a, r) => a + Number(r.k) || 0, 0);
  const brandstof = D.b.filter(b => iR(b.d, s, e)).reduce((a, b) => a + money(b.a), 0);
  const overig = (D.o || []).filter(x => iR(x.d, s, e)).reduce((a, x) => a + money(x.a), 0);
  const kosten = brandstof + overig;
  const winst = omzet - kosten;
  const verlies = cancelled.reduce((a, r) => a + money(r.v), 0);
  const doneChron = useMemo(
    () => [...done].sort((a, b) => (a.d + (a.ti || "")).localeCompare(b.d + (b.ti || ""))),
    [done]
  );
  const doneFactuurChron = useMemo(
    () =>
      [...all]
        .filter(r => r.s === "voltooid" && iR(r.d, fs, fe))
        .sort((a, b) => (a.d + (a.ti || "")).localeCompare(b.d + (b.ti || ""))),
    [all, fs, fe]
  );
  const periodFactuurStem = `${fs}_${fe}`.replace(/[^\w.-]+/g, "_");
  const periodLabel =
    p === "day" ? `Dag ${s}` : p === "week" ? `Week ${s} t/m ${e}` : `Maand ${s.slice(0, 7)} (${s} t/m ${e})`;
  const factuurDatumLabel = fs === fe ? `Dag ${fs}` : `${fs} t/m ${fe}`;

  const finBarData = useMemo(
    () => ({
      labels: ["Omzet", "Kosten", "Netto"],
      datasets: [
        {
          label: "€",
          data: [omzet, kosten, winst],
          backgroundColor: [tmAccRgba(0.55), "rgba(239, 68, 68, 0.5)", "rgba(146, 168, 74, 0.5)"],
          borderColor: [TM_ACC, "#ef4444", winst >= 0 ? TM_GN : "#ef4444"],
          borderWidth: 1,
          borderRadius: 8,
        },
      ],
    }),
    [omzet, kosten, winst]
  );
  const finBarOpts = useMemo(
    () => ({
      ...TM_CHART_BASE,
      plugins: {
        ...TM_CHART_BASE.plugins,
        legend: { display: false },
        tooltip: {
          ...TM_CHART_BASE.plugins.tooltip,
          callbacks: {
            label: ctx => (ctx.dataset.label ? `${ctx.dataset.label} ` : "") + E(Number(ctx.raw) || 0),
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "#6f6f68", font: { size: 11 } },
          grid: { display: false },
        },
        y: {
          ticks: {
            color: "#6f6f68",
            font: { size: 10 },
            callback: v => "€" + v,
          },
          grid: { color: "rgba(40,40,40,0.45)" },
          beginAtZero: true,
        },
      },
    }),
    []
  );

  const showChart = omzet > 0 || kosten > 0;

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Financieel overzicht</h1>
      <p style={{ fontSize: 12, color: "var(--tx3)", margin: "0 0 14px", lineHeight: 1.4 }}>
        Periode = lokale datum. Alle voltooide ritten en kosten in de gekozen periode. PDF en CSV zijn altijd te
        downloaden (ook zonder ritten: lege export of factuur €&nbsp;0).
      </p>
      <PP v={p} set={sP} />

      {showChart && (
        <div className="tm-chart-card tm-fin-chart">
          <div className="tm-chart-hd">Omzet, kosten en netto (deze periode)</div>
          <div className="tm-chart-body tm-chart-body--bar tm-chart-body--fin">
            <Bar data={finBarData} options={finBarOpts} />
          </div>
        </div>
      )}

      <div className="sh">Resultaat</div>
      <div className="stat-grid">
        {statCard(
          "Omzet",
          done.length > 0 ? E(omzet) : "—",
          "var(--acc)",
          done.length > 0 ? `${done.length} voltooide ritten${totKm > 0 ? ` · ${totKm} km` : ""}` : "Geen voltooide ritten in deze periode"
        )}
        {statCard(
          "Kosten",
          kosten > 0 ? "− " + E(kosten) : "—",
          "var(--rd)",
          kosten > 0 ? `Brandstof ${E(brandstof)} · overig ${E(overig)}` : "Geen kosten in deze periode"
        )}
        {statCard(
          "Netto",
          done.length > 0 || kosten > 0 ? E(winst) : "—",
          winst >= 0 ? "var(--gn)" : "var(--rd)",
          done.length > 0 && omzet > 0 ? `Omzet minus kosten (${Math.round((winst / omzet) * 100)}%)` : null
        )}
        {cancelled.length > 0 && verlies > 0
          ? statCard("Annuleringen (info)", E(verlies), "var(--am)", `${cancelled.length} ritten · telt niet mee in netto`)
          : null}
      </div>

      <div className="card" style={{ marginTop: 16, padding: 14, background: "var(--s2)" }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Factuur (datum bereik)</div>
        <p style={{ fontSize: 12, color: "var(--tx2)", margin: "0 0 10px", lineHeight: 1.45 }}>
          Dashboard hierboven: <strong>{periodLabel}</strong>. Voor PDF/CSV kies je het <strong>inclusieve</strong>{" "}
          datumbereik (voltooide ritten op ritdatum). Standaard gelijk aan de gekozen dag/week/maand.
        </p>
        <div className="tm-g2" style={{ marginBottom: 12 }}>
          <div className="tm-fg">
            <label className="fl">Van (datum)</label>
            <input type="date" value={factuurVan} onChange={ev => setFactuurVan(ev.target.value)} />
          </div>
          <div className="tm-fg">
            <label className="fl">Tot en met</label>
            <input type="date" value={factuurTot} onChange={ev => setFactuurTot(ev.target.value)} />
          </div>
        </div>
        <p style={{ fontSize: 12, color: "var(--tx2)", margin: "0 0 12px", lineHeight: 1.45 }}>
          <strong>{factuurDatumLabel}</strong> — {doneFactuurChron.length} voltooide rit(ten) in dit bereik. Meerdere
          bonnen per rit → meerdere regels. PDF: <strong>Meer → Factuur &amp; logo</strong> (profiel {pid}).
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            type="button"
            className="btn btn-o btn-full"
            onClick={() => downloadFactuurCsv(doneFactuurChron, periodFactuurStem)}
          >
            CSV (dit bereik)
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
                const regels = tmRittenNaarFactuurRegels(doneFactuurChron);
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
            {pdfBusy ? "PDF…" : "PDF-factuur (dit bereik)"}
          </button>
        </div>
      </div>

      {done.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div className="sh">Laatste ritten</div>
          {[...done].sort((a, b) => b.d.localeCompare(a.d)).slice(0, 10).map(r => (
            <div key={r.id} className="tm-f-row">
              <span className="tm-f-date">{r.d}</span>
              <span className="tm-f-route">
                {r.f} → {r.t}
              </span>
              {isN(r.ti) && (
                <span style={{ fontSize: 11, color: "var(--am)", marginRight: 8 }}>
                  NACHT
                </span>
              )}
              <span className="tm-f-km">{r.k} km</span>
              <span className="tm-f-eur">{E(r.v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PPh({ v, set }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
      {[
        ["day", "Dag"],
        ["week", "Week"],
        ["month", "Maand"],
        ["all", "Alles"],
      ].map(([k, l]) => (
        <button key={k} type="button" className={"btn " + (v === k ? "btn-p" : "btn-o")} onClick={() => set(k)}>
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
              Handmatige km/€ — niet overschreven door &quot;Alle ritten herberekenen&quot; in Meer.
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
          {open ? "Sluiten" : "Km & € aanpassen"}
        </button>
      </div>
      {open && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--br)" }}>
          <p style={{ fontSize: 11, color: "var(--tx2)", margin: "0 0 10px", lineHeight: 1.4 }}>
            Aangepaste waarden tellen mee in Home, Financieel, factuur-PDF/CSV en export.
          </p>
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
              Opslaan (handmatig)
            </button>
            <button type="button" className="btn btn-o" onClick={onApplyTarief}>
              € volgens tarief (op basis van km)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Historiek({ D, pid, sD }) {
  const [p, sP] = useState("all");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [s, e] = grExt(p);
  const [factuurVan, setFactuurVan] = useState(s);
  const [factuurTot, setFactuurTot] = useState(e);

  useEffect(() => {
    setFactuurVan(s);
    setFactuurTot(e);
  }, [p, s, e]);

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
  const periodLabel =
    p === "all"
      ? "Alle data"
      : p === "day"
        ? `Dag ${s}`
        : p === "week"
          ? `${s} t/m ${e}`
          : `${s.slice(0, 7)} (${s} t/m ${e})`;
  const factuurDatumLabel = fs === fe ? `Dag ${fs}` : `${fs} t/m ${fe}`;
  const exportStem = `${fs}_${fe}`.replace(/[^\w.-]+/g, "_");

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Historiek</h1>
      <p style={{ fontSize: 13, color: "var(--tx2)", margin: "0 0 14px", lineHeight: 1.45 }}>
        Elk bedrag komt rechtstreeks uit je opgeslagen ritten en kosten. Totalen = <strong>som van de lijnen</strong>{" "}
        (zelfde rekenregels als Financieel). Bij <strong>voltooide</strong> ritten kun je onderaan de kaart{" "}
        <strong>Km &amp; € aanpassen</strong> als de automatische meting of het tarief niet klopt.
      </p>
      <PPh v={p} set={sP} />
      <div className="card tm-rit-sum" style={{ marginBottom: 16 }}>
        <div className="tm-rvi">
          <span>Periode</span>
          <b>{periodLabel}</b>
        </div>
        <div className="tm-rvi">
          <span>Omzet (alleen voltooid)</span>
          <b style={{ color: "var(--acc)" }}>{E(omzet)}</b>
        </div>
        <div className="tm-rvi">
          <span>Brandstof (som tankbeurten)</span>
          <b style={{ color: "var(--rd)" }}>− {E(brandstof)}</b>
        </div>
        <div className="tm-rvi">
          <span>Overig (som posten)</span>
          <b style={{ color: "var(--rd)" }}>− {E(overig)}</b>
        </div>
        <div className="tm-rvi">
          <span>Netto</span>
          <b style={{ color: netto >= 0 ? "var(--gn)" : "var(--rd)" }}>{E(netto)}</b>
        </div>
        <p style={{ fontSize: 11, color: "var(--tx3)", margin: "10px 0 0", lineHeight: 1.35 }}>
          Dagen en maanden volgens je toestel (lokale tijd). <strong>Annuleren</strong> op Home of Ritten{" "}
          <strong>verwijdert</strong> de rit (telt nergens mee). “Gemist (annulering)” op Financieel geldt alleen nog voor
          oude/import-ritten met status geannuleerd.
        </p>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 14, background: "var(--s2)" }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Export voor facturen (datum bereik)</div>
        <p style={{ fontSize: 12, color: "var(--tx2)", margin: "0 0 10px", lineHeight: 1.45 }}>
          Kies het <strong>inclusieve</strong> datumbereik voor PDF/CSV (voltooide ritten). Standaard gelijk aan de
          filter hierboven; je mag het vernauwen of verruimen.
        </p>
        <div className="tm-g2" style={{ marginBottom: 12 }}>
          <div className="tm-fg">
            <label className="fl">Van (datum)</label>
            <input type="date" value={factuurVan} onChange={ev => setFactuurVan(ev.target.value)} />
          </div>
          <div className="tm-fg">
            <label className="fl">Tot en met</label>
            <input type="date" value={factuurTot} onChange={ev => setFactuurTot(ev.target.value)} />
          </div>
        </div>
        <p style={{ fontSize: 12, color: "var(--tx2)", margin: "0 0 12px", lineHeight: 1.45 }}>
          <strong>{factuurDatumLabel}</strong> — {voltooidExportChron.length} voltooide rit(ten). CSV/PDF:{" "}
          <strong>Meer → Factuur &amp; logo</strong> (profiel <code style={{ fontSize: 11 }}>{pid}</code>).
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            type="button"
            className="btn btn-o btn-full"
            onClick={() => downloadFactuurCsv(voltooidExportChron, exportStem)}
          >
            CSV downloaden (Excel / boekhouder)
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
            {pdfBusy ? "PDF wordt gemaakt…" : "PDF-factuur downloaden"}
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
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>Kosten registreren</h1>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        <button type="button" className={"btn " + (type === "brandstof" ? "btn-p" : "btn-o")} onClick={() => sT("brandstof")}>
          Brandstof
        </button>
        <button type="button" className={"btn " + (type === "overig" ? "btn-p" : "btn-o")} onClick={() => sT("overig")}>
          Overige kosten
        </button>
      </div>

      {type === "brandstof" && (
        <div className="card">
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Tankbeurt registreren</div>
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
            {fuelDet ? "Verberg liter & prijs" : "Liter & prijs (optioneel — vult bedrag)"}
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
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Overige kost registreren</div>
          <div className="tm-g2">
            <div className="tm-fg">
              <label className="fl">Datum</label>
              <input type="date" value={fm.d} onChange={e => sM(m => ({ ...m, d: e.target.value }))} />
            </div>
            <div className="tm-fg">
              <label className="fl">Bedrag</label>
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
      {D.b.length === 0 && <p className="tm-em">Geen tankbeurten</p>}
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
      {(D.o || []).length === 0 && <p className="tm-em">Geen overige kosten</p>}
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
      <p style={{ fontSize: 13, color: "var(--tx2)", marginBottom: 14, lineHeight: 1.45 }}>
        Zelfde opslag als de grote Transporteur-app (<code style={{ fontSize: 11 }}>transporteur_factuur_gegevens_{pid}</code>
        ). Logo en teksten verschijnen op je PDF-factuur (Historiek / Financieel).
      </p>

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
          <p style={{ fontSize: 12, color: "var(--tx3)", margin: "0 0 10px" }}>Nog geen logo — optioneel voor de PDF.</p>
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
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Van (jouw gegevens op de factuur)</div>
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
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Aan (klant op de factuur)</div>
        {fg("klantBedrijfsnaam", "Bedrijfsnaam / instantie", "")}
        {fg("klantContactpersoon", "Contactpersoon (t.a.v.)", "")}
        {fg("klantAdres", "Adres klant", "")}
        {fg("klantLand", "Land klant", "België")}
        {fg("klantBtw", "BTW-nummer klant", "")}
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>BTW &amp; verval op PDF</div>
        <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={Boolean(S.factuurBtwAanrekenen)}
            onChange={e => setS(prev => ({ ...prev, factuurBtwAanrekenen: e.target.checked }))}
          />
          <span>BTW aanrekenen op ritbedragen (PDF toont % en verhoogt te betalen)</span>
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
          <label className="fl">Vrijstellings-/ voetnoottekst (onderaan factuur)</label>
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
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Weekrapport (klassieke app)</div>
        <p style={{ fontSize: 12, color: "var(--tx3)", margin: "0 0 10px", lineHeight: 1.4 }}>
          Alleen relevant als je de grote app nog gebruikt voor het maandag-mailtje.
        </p>
        <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={Boolean(S.dagrapportEmailAan)}
            onChange={e => setS(prev => ({ ...prev, dagrapportEmailAan: e.target.checked }))}
          />
          <span>Conceptmail weekrapport inschakelen</span>
        </label>
        {fg("dagrapportOntvanger", "E-mail ontvanger", "")}
      </div>

      <button type="button" className="btn btn-p btn-full" onClick={persistAll}>
        Factuurgegevens opslaan
      </button>
      {hint && (
        <p style={{ fontSize: 13, color: "var(--gn)", marginTop: 12, textAlign: "center" }}>
          Opgeslagen voor dit profiel.
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
      alert("Geen nieuwe foto’s in de wachtrij (status ‘Wacht op OCR’ of ‘Fout’).");
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
                ? { ...r, status: "error", errMsg: String(e?.message || e || "OCR mislukt") }
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
      alert("Kies per foto een rit en zorg dat er minstens één IHcT-code herkend is.");
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
    alert(`${n} foto${n === 1 ? "" : "’s"} toegepast — bonnen staan op de ritten. Factuur-PDF/CSV gebruiken deze bonnen.`);
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
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Bon-foto’s (OCR → ritten)</div>
      <p style={{ fontSize: 12, color: "var(--tx3)", margin: "0 0 12px", lineHeight: 1.45 }}>
        Sleep hier foto’s van <strong>voltooide</strong> transportbonnen. De app zoekt <strong>IHcT</strong>-codes in de
        tekst (Nederlands/Engels OCR). Koppel elke foto aan de juiste rit — daarna verschijnen de bonnen op je{" "}
        <strong>factuur</strong> en CSV (zelfde als handmatig invullen). Eerste keer laadt Tesseract taalbestanden
        (internet nodig); daarna kan het uit cache.
      </p>
      <div className="tm-g2" style={{ marginBottom: 12 }}>
        <div className="tm-fg">
          <label className="fl">Ritten tonen / auto-koppel vanaf</label>
          <input type="date" value={van} onChange={e => setVan(e.target.value)} />
        </div>
        <div className="tm-fg">
          <label className="fl">Tot en met</label>
          <input type="date" value={tot} onChange={e => setTot(e.target.value)} />
        </div>
      </div>
      <p style={{ fontSize: 11, color: "var(--tx3)", margin: "0 0 10px", lineHeight: 1.35 }}>
        {voltooidePool.length} voltooide rit(ten) in dit bereik
        {voltooidePool.filter(r => !String(r.bon || "").trim()).length
          ? ` · ${voltooidePool.filter(r => !String(r.bon || "").trim()).length} zonder bon`
          : ""}
        . Auto-koppel alleen als er precies één passende rit zonder bon is (eventueel met datum uit de foto).
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
          OCR… {Math.round(progress * 100)}%
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <button type="button" className="btn btn-p" disabled={busy || rows.length === 0} onClick={runOcr}>
          {busy ? "OCR bezig…" : "Tekst herkennen (OCR)"}
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
                    ? "Wacht op OCR"
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
                    Geen IHcT-code gevonden — typ de bon handmatig bij de rit of probeer een scherpere foto.
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

function Meer({ D, sD, pid, sP, pr, onBackupImported }) {
  const [v, sV] = useState("m");
  const [erA, setErA] = useState(null);
  const [erB, setErB] = useState(null);
  const [erK, setErK] = useState("");
  const [erBusy, setErBusy] = useState(false);
  const [ritZoek, setRitZoek] = useState("");
  const [meerToonVoltooide, setMeerToonVoltooide] = useState(false);
  const [bonEdit, setBonEdit] = useState({});
  const [recalcRittenBusy, setRecalcRittenBusy] = useState(false);
  const backupFileRef = useRef(null);
  const ziekenVoorMeer = useMemo(
    () => ziekenLijstMetArchief(TM_ZIEKENHUIZEN_LIJST, D.xrArch || []),
    [D.xrArch]
  );

  const rittenBeheer = useMemo(() => {
    const q = ritZoek.trim().toLowerCase();
    let rows = [...D.r];
    if (q) {
      rows = rows.filter(r => {
        const blob = `${r.d} ${r.f} ${r.t} ${r.bon || ""} ${r.dr || ""}`.toLowerCase();
        return blob.includes(q);
      });
    }
    return rows.sort((a, b) => (b.d + (b.ti || "")).localeCompare(a.d + (a.ti || "")));
  }, [D.r, ritZoek]);

  const rittenBeheerZichtbaar = useMemo(() => {
    const q = ritZoek.trim();
    if (q || meerToonVoltooide) return rittenBeheer;
    return rittenBeheer.filter(r => r.s !== "voltooid");
  }, [rittenBeheer, ritZoek, meerToonVoltooide]);

  const aantalVoltooide = useMemo(() => D.r.filter(r => r.s === "voltooid").length, [D.r]);

  const saveRitBon = id => {
    const raw = bonEdit[id] !== undefined ? bonEdit[id] : D.r.find(x => x.id === id)?.bon || "";
    const b = String(raw).trim();
    const rr = D.r.map(r => {
      if (r.id !== id) return r;
      const o = { ...r };
      if (b) o.bon = b;
      else delete o.bon;
      return o;
    });
    const nd = normData({ ...D, r: rr });
    sD(nd);
    sv(pid, nd);
    setBonEdit(m => {
      const n = { ...m };
      delete n[id];
      return n;
    });
  };

  const verwijderRit = id => {
    if (!confirm("Deze rit permanent verwijderen?")) return;
    const nd = normData({ ...D, r: D.r.filter(x => x.id !== id) });
    sD(nd);
    sv(pid, nd);
    setBonEdit(m => {
      const n = { ...m };
      delete n[id];
      return n;
    });
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
        "Alle ritten opnieuw meten via de rijroute (internet nodig). Km en vergoeding worden bijgewerkt waar vertrek en bestemming herkend worden. Ritten die je in Historiek handmatig hebt aangepast (km/€) worden overgeslagen. Doorgaan?"
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

  const addEigenRoute = () => {
    const f = (erA?.name || "").trim();
    const t = (erB?.name || "").trim();
    const k = Number(String(erK).replace(",", "."));
    if (!f || !t) {
      alert("Kies vertrek en bestemming via de zoeklijst.");
      return;
    }
    if (!Number.isFinite(k) || k < 1) {
      alert("Vul een geldige afstand (km), of gebruik ‘Kortste weg’.");
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
  if (v !== "m")
    return (
      <div>
        <button type="button" className="btn btn-gh" style={{ marginBottom: 12 }} onClick={() => sV("m")}>
          ← Terug
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 14 }}>
          {v === "p" ? "Profiel" : v === "f" ? "Factuur & logo" : "Gegevens"}
        </h1>
        {v === "p" && (
          <div className="tm-pg">
            {PR.map(p => (
              <button
                key={p.id}
                type="button"
                className={"tm-pc" + (p.id === pid ? " on" : "")}
                onClick={() => sP(p.id)}
              >
                <div className="tm-pav">{p.i}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: p.id === pid ? "var(--acc)" : "var(--tx2)" }}>{p.n}</div>
                {p.id === pid && <div style={{ fontSize: 10, color: "var(--acc)", marginTop: 3 }}>Actief</div>}
              </button>
            ))}
          </div>
        )}
        {v === "f" && <FactuurGegevensScherm pid={pid} />}
        {v === "d" && (
          <div>
            <p style={{ marginBottom: 16, color: "var(--tx2)", fontSize: 14 }}>
              {D.r.length} ritten · {D.b.length} tankbeurten · {(D.o || []).length} overige kosten (actief profiel)
            </p>
            <div className="card" style={{ marginBottom: 14, padding: 14, background: "var(--s2)" }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Volledige backup</div>
              <p style={{ fontSize: 13, color: "var(--tx2)", margin: "0 0 12px", lineHeight: 1.45 }}>
                Alle profielen, TransportMe-data en klassieke app-gegevens in één .json-bestand. Bewaar dit op een
                veilige plek (geen cloud in de app zelf).
              </p>
              <button type="button" className="btn btn-p btn-full" style={{ marginBottom: 8 }} onClick={() => exportTransporteurData()}>
                Backup downloaden
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
                      "Volledige vervanging op dit toestel?\n\n" +
                        "OK = eerst alle Transporteur- en TransportMe-data hier wissen, daarna de backup (aanbevolen bij nieuwe telefoon).\n" +
                        "Annuleren = alleen de sleutels uit het bestand overschrijven (rest blijft staan)."
                    );
                    const n = applyImportPayload(payload, { replaceAll: volledig });
                    alert(`Backup teruggezet (${n} onderdelen).`);
                    onBackupImported?.();
                  } catch (err) {
                    console.error(err);
                    alert("Importeren mislukt. Kies een .json-export van deze app.");
                  }
                }}
              />
              <button type="button" className="btn btn-o btn-full" onClick={() => backupFileRef.current?.click()}>
                Backup terugzetten
              </button>
            </div>
            <div
              className="card"
              style={{ marginBottom: 14, padding: 14, background: "var(--s2)", borderColor: "var(--am)" }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Herstel uit klassieke app</div>
              <p style={{ fontSize: 13, color: "var(--tx2)", margin: "0 0 12px", lineHeight: 1.45 }}>
                Vervangt de TransportMe-gegevens van <strong>{pr.n}</strong> opnieuw vanuit de oude localStorage (
                transporteur_*). Gebruik dit als bedragen verkeerd lijken (bijv. door import). Alleen ritten die{" "}
                <em>alleen</em> in TransportMe stonden, gaan verloren.
              </p>
              <button
                type="button"
                className="btn btn-o btn-full"
                onClick={() => {
                  const leg = leesLegacyBundel(pid);
                  const n = leg.r.length + leg.b.length + leg.o.length;
                  if (n === 0) {
                    alert(
                      "Geen gegevens in klassieke opslag voor dit profiel. Probeer een ander profiel, of zet een .json-backup terug."
                    );
                    return;
                  }
                  if (
                    !confirm(
                      `Vervangen door ${leg.r.length} ritten, ${leg.b.length} tankbeurten, ${leg.o.length} overige kosten uit de klassieke app?`
                    )
                  ) {
                    return;
                  }
                  const merged = normData({ ...leg, xr: D.xr || [] });
                  sD(merged);
                  sv(pid, merged);
                  alert("Herstel uit klassieke opslag voltooid.");
                }}
              >
                Opnieuw importeren uit klassieke opslag
              </button>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--tx3)", marginBottom: 8 }}>Alleen huidig profiel</div>
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
              JSON export (dit profiel)
            </button>
            <button
              type="button"
              className="btn btn-r btn-full"
              onClick={() => {
                if (confirm("Alle gegevens van dit profiel wissen?")) {
                  const n = normData({ r: [], b: [], o: [], xr: [], xrArch: [] });
                  sD(n);
                  sv(pid, n);
                }
              }}
            >
              Alles wissen (dit profiel)
            </button>
          </div>
        )}
      </div>
    );

  const googleMapsKey = hasGoogleMapsApiKey();

  return (
    <div className="tm-meer-hub">
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 18 }}>Instellingen</h1>

      <section className="tm-meer-sec" aria-labelledby="tm-meer-acc">
        <h2 id="tm-meer-acc" className="tm-meer-sec-h">
          Account
        </h2>
        {[
          { k: "p", t: "Profiel", s: pr.n + " · Wissel chauffeur" },
          { k: "f", t: "Factuur & logo", s: "Van/Aan, btw, logo — zelfde als grote app" },
        ].map(m => (
          <button key={m.k} type="button" className="tm-mi" onClick={() => sV(m.k)}>
            <strong>{m.t}</strong>
            <small>{m.s}</small>
          </button>
        ))}
      </section>

      <section className="tm-meer-sec" aria-labelledby="tm-meer-data">
        <h2 id="tm-meer-data" className="tm-meer-sec-h">
          Gegevens & backup
        </h2>
        <button type="button" className="tm-mi" onClick={() => sV("d")}>
          <strong>Gegevens</strong>
          <small>Backup, export, herstel klassieke app & wissen</small>
        </button>
      </section>

      <section className="tm-meer-sec" aria-labelledby="tm-meer-ritten">
        <h2 id="tm-meer-ritten" className="tm-meer-sec-h">
          Ritten & routes
        </h2>
      <div className="card tm-meer-ritten-card">
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Ritten beheren</div>
        <p style={{ fontSize: 12, color: "var(--tx3)", margin: "0 0 10px", lineHeight: 1.4 }}>
          Zoeken, bon aanpassen, rit wissen.
        </p>
        <button
          type="button"
          className="btn btn-o btn-full"
          style={{ marginBottom: 12 }}
          disabled={recalcRittenBusy || D.r.length === 0}
          onClick={herberekenAlleRittenKm}
        >
          {recalcRittenBusy ? "Bezig met herberekenen…" : "Alle ritten: km + vergoeding (rijroute)"}
        </button>
        <p style={{ fontSize: 11, color: "var(--tx3)", margin: "-4px 0 12px", lineHeight: 1.35 }}>
          Zelfde volgorde als elders: Google Maps (indien sleutel), anders OpenRouteService, anders OSRM. Ritten met
          onbekende namen blijven ongewijzigd.
        </p>
        <div className="tm-fg">
          <label className="fl">Zoeken</label>
          <input
            type="text"
            placeholder="Filter…"
            value={ritZoek}
            onChange={e => setRitZoek(e.target.value)}
          />
        </div>
        {!ritZoek.trim() && aantalVoltooide > 0 ? (
          <label className="tm-meer-voltooide-toggle">
            <input
              type="checkbox"
              checked={meerToonVoltooide}
              onChange={e => setMeerToonVoltooide(e.target.checked)}
            />
            <span>Voltooide tonen ({aantalVoltooide})</span>
          </label>
        ) : null}
        {rittenBeheerZichtbaar.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--tx3)", margin: "8px 0 0" }}>
            {rittenBeheer.length === 0 ? "Geen ritten." : "Alleen voltooide ritten — vink hierboven aan of zoek."}
          </p>
        ) : (
          <div className="tm-meer-ritten-scroll">
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
              {rittenBeheerZichtbaar.slice(0, 10).map(r => (
                <div
                  key={r.id}
                  className="tm-brow"
                  style={{ flexDirection: "column", alignItems: "stretch", gap: 8, padding: "10px 0" }}
                >
                  <div style={{ fontSize: 12, color: "var(--tx3)" }}>
                    {r.d}
                    {r.ti ? " · " + r.ti : ""} · <Badge s={r.s} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {r.f} → {r.t}
                  </div>
                  <div className="tm-g2" style={{ alignItems: "flex-end" }}>
                    <div className="tm-fg" style={{ marginBottom: 0 }}>
                      <label className="fl">Bon</label>
                      <input
                        type="text"
                        autoCapitalize="characters"
                        value={bonEdit[r.id] !== undefined ? bonEdit[r.id] : r.bon || ""}
                        onChange={e => setBonEdit(m => ({ ...m, [r.id]: e.target.value }))}
                        placeholder="—"
                      />
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button type="button" className="btn btn-o" onClick={() => saveRitBon(r.id)}>
                        Bon opslaan
                      </button>
                      <button type="button" className="btn btn-gh" style={{ color: "var(--rd)" }} onClick={() => verwijderRit(r.id)}>
                        Verwijder rit
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {rittenBeheerZichtbaar.length > 10 && (
                <p style={{ fontSize: 11, color: "var(--tx3)", margin: 0 }}>
                  Toont 10 van {rittenBeheerZichtbaar.length} — zoek verder.
                </p>
              )}
            </div>
          </div>
        )}
        <div className="tm-meer-split" role="separator" />
        <BonFotoImportSection D={D} sD={sD} pid={pid} />
        <div className="tm-meer-split" role="separator" />
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Eigen vaste routes</div>
        <p style={{ fontSize: 12, color: "var(--tx3)", margin: "0 0 10px", lineHeight: 1.4 }}>
          OSM-zoeken. <strong>Afstand</strong> is altijd een <strong>rijroute over echte wegen</strong> (autosnelwegen
          waar de kaart dat toelaat) — geen vogelvlucht. Standaard via gratis OSRM; met{" "}
          <code className="tm-meer-code">VITE_GOOGLE_MAPS_API_KEY</code> eerst Google Maps.{" "}
          {googleMapsKey ? (
            <span style={{ color: "var(--gn)" }}>Google-sleutel actief.</span>
          ) : (
            <>
              Optioneel: <code className="tm-meer-code">VITE_OPENROUTE_API_KEY</code> als extra fallback.
            </>
          )}
        </p>
        <PlaatsPicker label="Vertrek" gekozen={erA} onKies={setErA} lijst={ziekenVoorMeer} />
        <PlaatsPicker label="Bestemming" gekozen={erB} onKies={setErB} lijst={ziekenVoorMeer} />
        <button type="button" className="btn btn-o btn-full" style={{ marginBottom: 10 }} disabled={erBusy} onClick={berekenEigenKm}>
          {erBusy ? "Bezig…" : "Rijroute-km berekenen"}
        </button>
        <div className="tm-fg">
          <label className="fl">Afstand (km)</label>
          <input type="number" min="1" step="1" placeholder="Handmatig of via knop hierboven" value={erK} onChange={e => setErK(e.target.value)} />
        </div>
        <button type="button" className="btn btn-p btn-full" style={{ marginBottom: 14 }} onClick={addEigenRoute}>
          Route toevoegen
        </button>
        {(D.xr || []).length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--tx3)", margin: 0 }}>Nog geen eigen routes.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(D.xr || []).map(r => (
              <div
                key={r.id}
                className="tm-brow"
                style={{ alignItems: "center", flexWrap: "nowrap", gap: 8 }}
              >
                <span style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
                  {r.f} → {r.t} · {r.k} km
                </span>
                <button type="button" className="btn btn-gh" onClick={() => delEigenRoute(r.id)} aria-label="Verwijderen">
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      </section>

      <section className="tm-meer-sec" aria-labelledby="tm-meer-tarief">
        <h2 id="tm-meer-tarief" className="tm-meer-sec-h">
          Tarief & regels
        </h2>
      <div className="card">
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Vergoedingsregels</div>
        {[
          { l: "Opstartpremie", v: "€ 15,00" },
          { l: "Per 20 km", v: "€ 25,00" },
          { l: "Nachttoeslag (20:00–04:59)", v: "+30% op het aantal schijven (×1,3, omhoog naar hele schijven × €25); niet op opstart, niet op forfait" },
          { l: "Forfait RKV Sango of RKV Mechelen ↔ UZA Edegem", v: "€ 35,00 (geen nachtopslag op forfait)" },
        ].map(r => (
          <div key={r.l} className="sep">
            <span className="lbl">{r.l}</span>
            <span className="val">{r.v}</span>
          </div>
        ))}
        <div style={{ fontSize: 13, color: "var(--acc)", fontWeight: 600, marginTop: 12 }}>
          Voorbeeld: 45 km = 3 schijven → dag €15+€75=€90; ’s nachts ceil(3×1,3)=4 schijven → €15+€100
        </div>
      </div>
      </section>
    </div>
  );
}

function IconNavHistoriek() {
  return (
    <svg className="tm-nav-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M8 7V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M5 11h14M5 21h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9 15h6M9 18h4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconNavHome() {
  return (
    <svg className="tm-nav-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6H9.5v6H5a1 1 0 0 1-1-1v-9.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconNavRitten() {
  return (
    <svg className="tm-nav-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 16.5l4-9 4 5 4-8 4 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="16.5" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12.5" r="1.6" fill="currentColor" />
      <circle cx="16" cy="8.5" r="1.6" fill="currentColor" />
      <circle cx="20" cy="16.5" r="1.6" fill="currentColor" />
    </svg>
  );
}

function IconNavFin() {
  return (
    <svg className="tm-nav-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 18V6h12v4H8v8H4zm12-8h4l2 2v10h-6V10z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinejoin="round"
      />
      <path d="M8 14h4M8 10h4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function IconNavKosten() {
  return (
    <svg className="tm-nav-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3v3M8 6h8l1 12H7L8 6zM10 10h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9 21h6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconNavMeer() {
  return (
    <svg className="tm-nav-svg" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="6" cy="12" r="1.75" fill="currentColor" />
      <circle cx="12" cy="12" r="1.75" fill="currentColor" />
      <circle cx="18" cy="12" r="1.75" fill="currentColor" />
    </svg>
  );
}

const NAV_ITEMS = [
  { id: "home", label: "Home", Icon: IconNavHome },
  { id: "ritten", label: "Ritten", Icon: IconNavRitten },
  { id: "fin", label: "Financieel", Icon: IconNavFin },
  { id: "hist", label: "Historiek", Icon: IconNavHistoriek },
  { id: "kosten", label: "Kosten", Icon: IconNavKosten },
  { id: "meer", label: "Meer", Icon: IconNavMeer },
];

export default function App() {
  const [tab, sT] = useState("home");
  const [pid, sP] = useState(() => initialProfileId());
  const [D, sD] = useState(() => ld(initialProfileId()));
  const [okPendingId, setOkPendingId] = useState(null);
  const [nieuwRitReq, setNieuwRitReq] = useState(0);
  const pr = PR.find(p => p.id === pid) || PR[0];
  const okPendingRit = okPendingId ? D.r.find(r => r.id === okPendingId) : null;

  const tripAct = useCallback(
    (id, a) => {
      if (a === "ok") {
        const r = D.r.find(x => x.id === id);
        if (r && (r.s === "lopend" || r.s === "komend")) {
          setOkPendingId(id);
          return;
        }
      }
      sD(cur => {
        const rr = applyTripAction(cur.r, id, a);
        if (rr === cur.r) return cur;
        const nd = { ...cur, r: rr };
        sv(pid, nd);
        return nd;
      });
    },
    [D.r, pid]
  );

  const bevestigVoltooi = useCallback(
    bon => {
      if (!okPendingId) return;
      const id = okPendingId;
      setOkPendingId(null);
      sD(cur => {
        const rr = applyTripAction(cur.r, id, "ok", { bon });
        if (rr === cur.r) return cur;
        const nd = { ...cur, r: rr };
        sv(pid, nd);
        return nd;
      });
    },
    [okPendingId, pid]
  );
  const sw = id => {
    sP(id);
    try {
      localStorage.setItem("tp", id);
      localStorage.setItem(LS_LEGACY_PROFILE, id);
    } catch {
      /* ignore */
    }
    sD(ld(id));
  };
  useEffect(() => sD(ld(pid)), [pid]);
  /** Legacy-data voor alle profielen naar t_* trekken zodat profielwissel meteen gevuld is. */
  useEffect(() => {
    try {
      PR.forEach(p => ld(p.id));
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="tm-app">
      {okPendingRit ? (
        <VoltooiBonSheet
          key={okPendingId}
          rit={okPendingRit}
          onBevestig={bevestigVoltooi}
          onAnnuleer={() => setOkPendingId(null)}
        />
      ) : null}
      <div className="tm-main">
        <div className="tm-tab-page" hidden={tab !== "home"}>
          <Home
            D={D}
            pr={pr}
            onPlanRit={() => {
              sT("ritten");
              setNieuwRitReq(n => n + 1);
            }}
            onTripAct={tripAct}
          />
        </div>
        <div className="tm-tab-page" hidden={tab !== "ritten"}>
          <Ritten D={D} sD={sD} pid={pid} onTripAct={tripAct} openNieuwRequest={nieuwRitReq} />
        </div>
        <div className="tm-tab-page" hidden={tab !== "fin"}>
          <Financieel D={D} pid={pid} />
        </div>
        <div className="tm-tab-page" hidden={tab !== "hist"}>
          <Historiek D={D} pid={pid} sD={sD} />
        </div>
        <div className="tm-tab-page" hidden={tab !== "kosten"}>
          <Kosten D={D} sD={sD} pid={pid} />
        </div>
        <div className="tm-tab-page" hidden={tab !== "meer"}>
          <Meer
            D={D}
            sD={sD}
            pid={pid}
            sP={sw}
            pr={pr}
            onBackupImported={() => {
              const id = initialProfileId();
              sP(id);
              sD(ld(id));
            }}
          />
        </div>
      </div>
      <nav className="tm-nav" aria-label="Hoofdnavigatie">
        {NAV_ITEMS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={"tm-nav-i" + (tab === id ? " on" : "")}
            onClick={() => sT(id)}
            aria-label={label}
            aria-current={tab === id ? "page" : undefined}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
