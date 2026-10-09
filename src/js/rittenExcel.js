/**
 * Rittenlijst als Excel (.xlsx), in hetzelfde formaat als het klantsjabloon "Rittenregistratie":
 * rij 1 parameters, rij 2 toelichting, rij 3 koppen, vanaf rij 4 één regel per bon, onderaan TOTAAL.
 * Bedragen komen uit de opgeslagen ritten (zelfde als de PDF-factuur); BTW en totalen zijn formules.
 */
import { vergoedingUitsplitsingVoorRit, vergoedingVoorRit, isNachtTariefTijd } from "./calculations.js";
import { OPSTART_PREMIE, VERGOEDING_PER_20KM, NACHT_TOESLAG_PERCENT, KM_SCHIJF, NACHT_START_UUR } from "./config.js";

const FONT = { name: "Arial", size: 9 };
const DUN = { style: "thin", color: { argb: "FF000000" } };
const RAND = { top: DUN, left: DUN, bottom: DUN, right: DUN };
const EURO = "#,##0.00";

const KOPPEN = [
  "Bonnummer",
  "Datum",
  "Pickup uur",
  "Nachtrit",
  "Vertrek",
  "Bestemming",
  "KM",
  "Schijven",
  "Basisprijs",
  `Nachttoeslag ${NACHT_TOESLAG_PERCENT}%`,
  "Totaal excl. BTW",
  "BTW %",
  "Totaal incl. BTW",
];
const BREEDTES = [13, 11, 9, 9, 28, 28, 8.7, 8, 11, 16.4, 14.7, 9, 14.3];

const r2 = n => Math.round((Number(n) || 0) * 100) / 100;

function bonnen(bon) {
  return String(bon || "")
    .split(/[,;\n\r]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

/** Verdeel een bedrag in n delen; de centen-afronding komt op het laatste deel. */
function verdeel(totaal, n) {
  if (n <= 1) return [r2(totaal)];
  const deel = Math.floor((totaal / n) * 100) / 100;
  const out = Array(n - 1).fill(deel);
  out.push(r2(totaal - deel * (n - 1)));
  return out;
}

function alsDatum(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** "14:30" → fractie van een dag (Excel-tijd). */
function alsTijd(ti) {
  const m = String(ti || "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return (+m[1] * 60 + +m[2]) / 1440;
}

function alsBon(t) {
  return /^\d{1,15}$/.test(t) ? Number(t) : t;
}

/** Ritten → regels (één per bon), met basisprijs en nachttoeslag uitgesplitst. */
export function rittenNaarExcelRegels(ritten) {
  const regels = [];
  const sorted = [...ritten].sort((a, b) => (a.d + (a.ti || "")).localeCompare(b.d + (b.ti || "")));
  for (const r of sorted) {
    const km = Number(r.k) || 0;
    const u = vergoedingUitsplitsingVoorRit(km, r.ti || "", { fromName: r.f, toName: r.t });
    const totaal = r2(r.v);
    const nachtAandeel = u.vergoeding > 0 ? (u.nachtToeslagEuro || 0) / u.vergoeding : 0;
    const nacht = r2(totaal * nachtAandeel);
    const b = bonnen(r.bon);
    const n = Math.max(1, b.length);
    const totalen = verdeel(totaal, n);
    const nachten = verdeel(nacht, n);
    for (let i = 0; i < n; i++) {
      regels.push({
        bon: b[i] ? alsBon(b[i]) : null,
        datum: alsDatum(r.d),
        uur: alsTijd(r.ti),
        nacht: isNachtTariefTijd(r.ti || "") ? "Nacht" : "Dag",
        vertrek: r.f || "",
        bestemming: r.t || "",
        km,
        schijven: u.isSangoUzaForfait ? null : u.schijven ?? Math.ceil(km / KM_SCHIJF),
        basis: r2(totalen[i] - nachten[i]),
        nachtToeslag: nachten[i],
        forfait: !!u.isSangoUzaForfait,
      });
    }
  }
  return regels;
}

function vulBlad(ws, regels, { titel, btw }) {
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 3, showGridLines: true }];
  BREEDTES.forEach((w, i) => (ws.getColumn(i + 1).width = w));

  // Rij 1: parameters (zelfde opbouw als het sjabloon)
  const p = ws.getRow(1);
  p.height = 13.5;
  const param = [
    ["A", "Prijs/schijf (€):", "B", VERGOEDING_PER_20KM, "General"],
    ["C", "Opstart (€):", "D", OPSTART_PREMIE, "General"],
    ["E", "Nacht (%):", "F", NACHT_TOESLAG_PERCENT / 100, "0%"],
    ["G", "BTW (%):", "H", btw, "0%"],
  ];
  for (const [lc, label, vc, v, fmt] of param) {
    const l = ws.getCell(lc + "1");
    l.value = label;
    l.font = { ...FONT, bold: true };
    const c = ws.getCell(vc + "1");
    c.value = v;
    c.numFmt = fmt;
    c.font = { name: "Calibri", size: 11 };
  }

  // Rij 2: toelichting
  ws.mergeCells("A2:M2");
  const t = ws.getCell("A2");
  t.value = titel;
  t.font = { name: "Arial", size: 8, color: { argb: "FF555555" } };
  t.alignment = { horizontal: "left" };
  ws.getRow(2).height = 12;

  // Rij 3: koppen
  const h = ws.getRow(3);
  h.height = 18;
  KOPPEN.forEach((k, i) => {
    const c = h.getCell(i + 1);
    c.value = k;
    c.font = { ...FONT, bold: true };
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border = RAND;
  });
  ws.getCell("L3").value = `BTW ${Math.round(btw * 100)}%`;

  // Regels
  const eerste = 4;
  regels.forEach((g, i) => {
    const n = eerste + i;
    const row = ws.getRow(n);
    row.height = 15.75;
    const k = g.basis + g.nachtToeslag;
    const l = r2(k * btw);
    const vals = [
      g.bon,
      g.datum,
      g.uur,
      g.nacht,
      g.vertrek,
      g.bestemming,
      g.km || null,
      g.schijven,
      g.basis,
      g.nachtToeslag,
      { formula: `I${n}+J${n}`, result: r2(k) },
      { formula: `ROUND(K${n}*$H$1,2)`, result: l },
      { formula: `K${n}+L${n}`, result: r2(k + l) },
    ];
    const fmts = ["General", "dd/mm/yyyy", "hh:mm", "General", "General", "General", "0.0", "General", EURO, EURO, EURO, EURO, EURO];
    vals.forEach((v, j) => {
      const c = row.getCell(j + 1);
      c.value = v;
      c.numFmt = fmts[j];
      c.font = { ...FONT, bold: j === 10 || j === 12 };
      c.alignment = { horizontal: j === 4 || j === 5 ? "left" : "center" };
      c.border = RAND;
    });
    ws.getCell(`D${n}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"Nacht,Dag"'] };
  });

  // Lege rij en TOTAAL
  const laatste = eerste + regels.length - 1;
  const tr = eerste + regels.length + 1;
  const row = ws.getRow(tr);
  row.height = 19.5;
  const a = row.getCell(1);
  a.value = "TOTAAL";
  a.font = { name: "Arial", size: 10, bold: true };
  const som = col =>
    regels.length
      ? { formula: `SUM(${col}${eerste}:${col}${laatste})`, result: 0 }
      : 0;
  const sK = r2(regels.reduce((x, g) => x + g.basis + g.nachtToeslag, 0));
  const sL = r2(regels.reduce((x, g) => x + r2((g.basis + g.nachtToeslag) * btw), 0));
  [
    ["K", sK],
    ["L", sL],
    ["M", r2(sK + sL)],
  ].forEach(([col, res]) => {
    const c = ws.getCell(col + tr);
    const f = som(col);
    c.value = typeof f === "object" ? { ...f, result: res } : res;
    c.numFmt = EURO;
    c.font = { name: "Arial", size: 10, bold: true };
    c.border = { top: DUN };
  });

  ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  ws.pageSetup.printTitlesRow = "3:3";
}

function veiligeBladnaam(s) {
  return String(s).replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Ritten";
}

/**
 * @param {Array<{ naam: string, ritten: Array, btw?: number }>} bladen  één blad per chauffeur
 * @param {{ periode: string, bestandsnaam: string }} opts
 */
export async function downloadRittenExcel(bladen, { periode, bestandsnaam }) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "TransportMe";
  wb.created = new Date();
  for (const b of bladen) {
    const regels = rittenNaarExcelRegels(b.ritten);
    const naam = bladen.length === 1 ? "Rittenregistratie" : veiligeBladnaam(b.naam);
    const ws = wb.addWorksheet(naam);
    vulBlad(ws, regels, {
      titel: `Rittenlijst ${b.naam}, ${periode}. ${regels.length === 1 ? "1 regel" : regels.length + " regels"} (één regel per bon).`,
      btw: (b.btw ?? 21) / 100,
    });
  }
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = bestandsnaam.endsWith(".xlsx") ? bestandsnaam : bestandsnaam + ".xlsx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ------------------------------------------------------------------ */
/* Inlezen: klantsjabloon Rittenregistratie (en vergelijkbare Excel)   */
/* ------------------------------------------------------------------ */

const NACHT_UUR_ZONDER_PICKUP = `${String(NACHT_START_UUR).padStart(2, "0")}:00`;

const MAAND_IN_NAAM = [
  ["januari", 1],
  ["februari", 2],
  ["maart", 3],
  ["april", 4],
  ["mei", 5],
  ["juni", 6],
  ["juli", 7],
  ["augustus", 8],
  ["september", 9],
  ["oktober", 10],
  ["november", 11],
  ["december", 12],
];

function r2euro(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function isoYmd(y, m, d) {
  const yy = Number(y);
  const mm = Number(m);
  const dd = Number(d);
  if (!Number.isFinite(yy) || !Number.isFinite(mm) || !Number.isFinite(dd)) return "";
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return "";
  const dt = new Date(Date.UTC(yy, mm - 1, dd));
  if (dt.getUTCFullYear() !== yy || dt.getUTCMonth() !== mm - 1 || dt.getUTCDate() !== dd) return "";
  return `${yy}-${pad2(mm)}-${pad2(dd)}`;
}

function normTekst(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[()[\]{}]/g, " ")
    .replace(/\s*\/\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normKop(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9%]+/g, " ")
    .trim();
}

/** ExcelJS-cel → ruwe waarde (geen unevaluated formule). */
export function excelCelWaarde(cell) {
  if (!cell) return null;
  const v = cell.value;
  if (v == null || v === "") return null;
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "string") {
    if (typeof v === "string" && !v.trim()) return null;
    return v;
  }
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "object") {
    if (Object.prototype.hasOwnProperty.call(v, "result")) {
      const r = v.result;
      if (r == null || r === "" || r === "#N/A" || r === "#VALUE!") return null;
      if (typeof r === "string" && !r.trim()) return null;
      return r;
    }
    if (Array.isArray(v.richText)) return v.richText.map(t => t.text || "").join("") || null;
    if (v.text != null && String(v.text).trim()) return v.text;
    if (v.formula != null || v.sharedFormula != null) return null;
    if (v.hyperlink && v.text) return v.text;
  }
  return null;
}

function alsGetal(v) {
  if (v == null || v === "") return NaN;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "boolean") return NaN;
  if (v instanceof Date) return NaN;
  const s0 = String(v).trim().replace(/\s/g, "").replace(/€/g, "");
  if (!s0) return NaN;
  const lastComma = s0.lastIndexOf(",");
  const lastDot = s0.lastIndexOf(".");
  let s = s0;
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) s = s0.replace(/\./g, "").replace(",", ".");
    else s = s0.replace(/,/g, "");
  } else if (lastComma > -1) s = s0.replace(",", ".");
  else if (lastDot > -1) {
    const parts = s0.split(".");
    if (!(parts.length === 2 && parts[1].length <= 2)) s = s0.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function jaarVanGetal(y, fallback) {
  const n = Number(y);
  if (!Number.isFinite(n)) return fallback;
  if (n >= 1000 && n <= 2100) return n;
  if (n >= 0 && n <= 99) return n >= 70 ? 1900 + n : 2000 + n;
  return fallback;
}

function ymdVanDate(dt) {
  if (!(dt instanceof Date) || Number.isNaN(dt.getTime())) return null;
  const h = dt.getUTCHours();
  if (h >= 12) {
    return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate(), bron: "date" };
  }
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), bron: "date" };
}

function ymdVanExcelSerial(n) {
  if (!Number.isFinite(n) || n < 1 || n > 80000) return null;
  const dag = Math.floor(n);
  const epoch = Date.UTC(1899, 11, 30) + dag * 86400000;
  const dt = new Date(epoch);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), bron: "serial" };
}

function ymdVanTekst(s, fallbackJaar) {
  const t = String(s || "").trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return { y: +m[1], m: +m[2], d: +m[3], bron: "iso" };
  m = t.match(/^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?$/);
  if (!m) return null;
  const a = +m[1];
  const b = +m[2];
  const y = m[3] != null ? jaarVanGetal(m[3], fallbackJaar) : fallbackJaar;
  if (a > 12 && b >= 1 && b <= 12) return { y, m: b, d: a, bron: "dmy" };
  if (b > 12 && a >= 1 && a <= 12) return { y, m: a, d: b, bron: "mdy" };
  // België: dag/maand
  return { y, m: b, d: a, bron: "dmy" };
}

function parseYmd(v, fallbackJaar) {
  if (v == null || v === "") return null;
  if (v instanceof Date) return ymdVanDate(v);
  if (typeof v === "number") {
    if (v >= 1 && v < 3) return null;
    const serial = ymdVanExcelSerial(v);
    if (serial) return serial;
  }
  return ymdVanTekst(v, fallbackJaar);
}

function parseTijd(v) {
  if (v == null || v === "") return "";
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const hu = v.getUTCHours();
    const miu = v.getUTCMinutes();
    if (hu || miu) return `${pad2(hu)}:${pad2(miu)}`;
    const hl = v.getHours();
    const mil = v.getMinutes();
    if (hl || mil) return `${pad2(hl)}:${pad2(mil)}`;
    return "";
  }
  if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1.5) {
    const min = Math.round((v % 1) * 1440);
    const h = Math.floor(min / 60) % 24;
    const mi = min % 60;
    return `${pad2(h)}:${pad2(mi)}`;
  }
  const m = String(v)
    .trim()
    .match(/^(\d{1,2})[:hHuU.](\d{2})(?:\s*(?:uur|u))?$/);
  if (!m) return "";
  const h = +m[1];
  const mi = +m[2];
  if (h > 23 || mi > 59) return "";
  return `${pad2(h)}:${pad2(mi)}`;
}

function isNachtCel(v) {
  if (v == null || v === "") return null;
  if (v === true || v === 1) return true;
  const s = normTekst(v);
  if (!s) return null;
  if (s === "nacht" || s === "nachtrit" || s === "n" || s === "ja" || s === "yes") return true;
  if (s === "dag" || s === "overdag" || s === "d" || s === "nee" || s === "no") return false;
  if (s.includes("nacht")) return true;
  return null;
}

function kopRol(kop) {
  const k = normKop(kop);
  if (!k) return null;
  if (/\bbon/.test(k)) return "bon";
  if (k === "datum" || k.startsWith("datum") || k === "date") return "datum";
  if (k.includes("pickup") || k === "uur" || k.includes("vertrekuur") || k === "tijd" || k.includes("pickup uur"))
    return "uur";
  if (k.includes("nachttoeslag") || (k.includes("nacht") && k.includes("toeslag"))) return "nachtToeslag";
  if (k === "nachtrit" || k === "nacht" || k.startsWith("nachtrit")) return "nacht";
  if (k.includes("vertrek") || k === "van" || k === "from" || k.includes("ophaal")) return "vertrek";
  if (k.includes("bestemming") || k === "naar" || k === "to" || k.includes("aflever")) return "bestemming";
  if (k === "km" || k.startsWith("km ") || k === "kilometer" || k === "kilometers") return "km";
  if (k.includes("schijf")) return "schijven";
  if (k.includes("basis")) return "basis";
  if (k.includes("excl")) return "excl";
  if (k.includes("incl")) return "incl";
  return null;
}

function maandUitBestandsnaam(naam) {
  const n = normTekst(naam);
  for (const [woord, nr] of MAAND_IN_NAAM) {
    if (n.includes(woord)) return nr;
  }
  return null;
}

function jaarUitBestandsnaam(naam, fallback) {
  const m = String(naam || "").match(/(?:^|[^\d])(20\d{2})(?:[^\d]|$)/);
  if (m) return +m[1];
  return fallback;
}

function leesKmKaart(wb) {
  const map = new Map();
  const zet = (key, km) => {
    const k = String(key || "").trim();
    const n = alsGetal(km);
    if (!k.includes("|") || !Number.isFinite(n) || n <= 0) return;
    map.set(k, n);
    map.set(k.toLowerCase(), n);
  };
  for (const ws of wb.worksheets) {
    const nm = String(ws.name || "").toLowerCase();
    const lijktKm = nm.includes("_km") || nm === "km" || /(^|[^a-z])km([^a-z]|$)/.test(nm.replace(/\s/g, ""));
    const max = Math.min(ws.rowCount || 0, 4000);
    let hits = 0;
    for (let r = 1; r <= max; r++) {
      const row = ws.getRow(r);
      const a = excelCelWaarde(row.getCell(1));
      const b = excelCelWaarde(row.getCell(2));
      if (typeof a === "string" && a.includes("|") && Number.isFinite(alsGetal(b))) {
        zet(a, b);
        hits++;
      }
    }
    if (!lijktKm && hits < 3) {
      /* blad is geen km-tabel */
    }
  }
  return map;
}

function kmVoorRoute(kaart, van, naar) {
  const a = String(van || "").trim();
  const b = String(naar || "").trim();
  if (!a || !b) return NaN;
  const keys = [`${a}|${b}`, `${a.toLowerCase()}|${b.toLowerCase()}`, `${b}|${a}`, `${b.toLowerCase()}|${a.toLowerCase()}`];
  for (const k of keys) {
    if (kaart.has(k)) return kaart.get(k);
  }
  const na = normTekst(a);
  const nb = normTekst(b);
  for (const [k, km] of kaart) {
    const i = String(k).indexOf("|");
    if (i < 0) continue;
    const kf = normTekst(k.slice(0, i));
    const kt = normTekst(k.slice(i + 1));
    if ((kf === na && kt === nb) || (kf === nb && kt === na)) return km;
  }
  return NaN;
}

function leesBladParams(ws) {
  const prijs = alsGetal(excelCelWaarde(ws.getRow(1).getCell(2)));
  const opstart = alsGetal(excelCelWaarde(ws.getRow(1).getCell(4)));
  return {
    prijs: prijs > 0 ? prijs : VERGOEDING_PER_20KM,
    opstart: Number.isFinite(opstart) && opstart >= 0 ? opstart : OPSTART_PREMIE,
  };
}

/** Schat km uit basisprijs van het sjabloon (schijven × prijs + toeslag). */
function kmUitBedrag(bedrag, prijs, opstart) {
  if (!Number.isFinite(bedrag) || bedrag < 0 || !(prijs > 0)) return NaN;
  const sch = Math.max(1, Math.round((bedrag - opstart) / prijs));
  if (!Number.isFinite(sch) || sch < 1) return NaN;
  return sch * KM_SCHIJF;
}

function kiesRittenBlad(wb) {
  const bladen = wb.worksheets || [];
  const score = ws => {
    const nm = normTekst(ws.name);
    if (nm.startsWith("_")) return -1;
    if (nm.includes("rittenregistratie") || nm === "ritten") return 100;
    if (nm.includes("ritten")) return 80;
    let s = 0;
    const row = ws.getRow(3);
    const row1 = ws.getRow(1);
    for (const r of [row1, ws.getRow(2), row, ws.getRow(4)]) {
      r.eachCell({ includeEmpty: false }, c => {
        const rol = kopRol(excelCelWaarde(c));
        if (rol === "vertrek" || rol === "bestemming" || rol === "bon" || rol === "datum") s += 5;
      });
    }
    return s;
  };
  let best = null;
  let bestS = -1;
  for (const ws of bladen) {
    const s = score(ws);
    if (s > bestS) {
      bestS = s;
      best = ws;
    }
  }
  return bestS >= 10 ? best : bladen.find(w => !String(w.name || "").startsWith("_")) || bladen[0] || null;
}

function vindKoppen(ws) {
  const lim = Math.min(20, ws.rowCount || 0);
  let best = null;
  for (let r = 1; r <= lim; r++) {
    const row = ws.getRow(r);
    const map = {};
    let hits = 0;
    row.eachCell({ includeEmpty: false }, (c, col) => {
      const rol = kopRol(excelCelWaarde(c));
      if (rol && map[rol] == null) {
        map[rol] = col;
        hits++;
      }
    });
    if (hits >= 3 && map.vertrek && map.bestemming) {
      if (!best || hits > best.hits) best = { rij: r, map, hits };
    }
  }
  if (best) return best;
  return {
    rij: 3,
    map: { bon: 1, datum: 2, uur: 3, nacht: 4, vertrek: 5, bestemming: 6, km: 7, schijven: 8, basis: 9, nachtToeslag: 10, excl: 11 },
    hits: 0,
  };
}

function celVanRol(row, map, rol) {
  const col = map[rol];
  if (!col) return null;
  return excelCelWaarde(row.getCell(col));
}

function isTotaalRij(row, map) {
  const a = excelCelWaarde(row.getCell(1));
  const vertrek = celVanRol(row, map, "vertrek");
  if (normTekst(a) === "totaal" && !String(vertrek || "").trim()) return true;
  return false;
}

function rijIsLeeg(row, map) {
  const f = String(celVanRol(row, map, "vertrek") || "").trim();
  const t = String(celVanRol(row, map, "bestemming") || "").trim();
  const bon = celVanRol(row, map, "bon");
  const d = celVanRol(row, map, "datum");
  const excl = alsGetal(celVanRol(row, map, "excl"));
  const basis = alsGetal(celVanRol(row, map, "basis"));
  return !f && !t && bon == null && d == null && !Number.isFinite(excl) && !Number.isFinite(basis);
}

function nachtUur(ti, nacht) {
  if (ti) return ti;
  if (nacht) return NACHT_UUR_ZONDER_PICKUP;
  return "";
}

/**
 * Groepeer export-splitsingen (één rit, meerdere bonnen) terug tot één rit.
 * Twee volledige ritten op dezelfde route/dag blijven apart.
 */
function voegGesplitsteBonsSamen(regels) {
  const groepen = new Map();
  const volgorde = [];
  for (const r of regels) {
    const key = `${r.d}|${r.ti}|${normTekst(r.f)}|${normTekst(r.t)}|${r.k}`;
    if (!groepen.has(key)) {
      groepen.set(key, []);
      volgorde.push(key);
    }
    groepen.get(key).push(r);
  }
  const out = [];
  for (const key of volgorde) {
    const g = groepen.get(key);
    if (g.length === 1) {
      out.push(g[0]);
      continue;
    }
    const tarief = vergoedingVoorRit(g[0].k, g[0].ti || "", { fromName: g[0].f, toName: g[0].t });
    const som = r2euro(g.reduce((a, x) => a + (Number(x.v) || 0), 0));
    const alleDeel = tarief > 0 && g.every(x => x.v + 0.05 < tarief);
    const somDicht = Math.abs(som - tarief) <= 0.05 * g.length + 0.02;
    if (alleDeel && (somDicht || som < tarief + 0.05)) {
      const bons = g.map(x => String(x.bon || "").trim()).filter(Boolean);
      out.push({
        ...g[0],
        v: som,
        bon: bons.join(", "),
      });
    } else {
      out.push(...g);
    }
  }
  return out;
}

function pasDatumSwapToe(ymd, swap) {
  if (!ymd) return null;
  if (swap && ymd.bron === "date" && ymd.d <= 12 && ymd.m <= 12 && ymd.d !== ymd.m) {
    return { ...ymd, m: ymd.d, d: ymd.m, bron: "date-swap" };
  }
  return ymd;
}

function bepaalSwap(verzameld, bestandsMaand) {
  const dateObj = verzameld.filter(x => x.bron === "date" && x.d <= 12);
  const dmy = verzameld.filter(x => x.bron === "dmy" || x.bron === "iso");
  if (dateObj.length < 2) return false;
  const maandTel = new Map();
  for (const x of dmy) maandTel.set(x.m, (maandTel.get(x.m) || 0) + 1);
  let domMaand = bestandsMaand;
  let domN = 0;
  for (const [m, n] of maandTel) {
    if (n > domN) {
      domN = n;
      domMaand = m;
    }
  }
  if (domMaand == null) return false;
  const zelfdeDag = dateObj.every(x => x.d === dateObj[0].d);
  const dagIsDoel = dateObj.filter(x => x.d === domMaand).length >= Math.ceil(dateObj.length * 0.6);
  if ((zelfdeDag && dateObj[0].d === domMaand) || dagIsDoel) return true;
  return false;
}

/**
 * @param {import("exceljs").Workbook} wb
 * @param {{ bestandsnaam?: string, nu?: Date }} [opts]
 * @returns {{ regels: Array<{bon:string,d:string,ti:string,f:string,t:string,k:number,v:number}>, overgeslagen: number, redenen: Record<string, number> }}
 */
export function parseRittenExcelWorkbook(wb, opts = {}) {
  const nu = opts.nu instanceof Date ? opts.nu : new Date();
  const fallbackJaar = jaarUitBestandsnaam(opts.bestandsnaam, nu.getFullYear());
  const bestandsMaand = maandUitBestandsnaam(opts.bestandsnaam);
  const kmKaart = leesKmKaart(wb);
  const ws = kiesRittenBlad(wb);
  if (!ws) return { regels: [], overgeslagen: 0, redenen: { blad: 1 } };

  const { rij: kopRij, map } = vindKoppen(ws);
  const params = leesBladParams(ws);
  const max = Math.min(ws.rowCount || 0, 5000);
  const ruweDatums = [];
  for (let r = kopRij + 1; r <= max; r++) {
    const ymd = parseYmd(celVanRol(ws.getRow(r), map, "datum"), fallbackJaar);
    if (ymd && ymd.y) ruweDatums.push(ymd);
  }
  const jaren = ruweDatums.map(x => x.y).filter(y => y >= 2000);
  const jaar = jaren.length ? jaren.sort((a, b) => a - b)[Math.floor(jaren.length / 2)] : fallbackJaar;
  const swap = bepaalSwap(
    ruweDatums.map(x => (x.y ? x : { ...x, y: jaar })),
    bestandsMaand
  );

  const regels = [];
  const redenen = {};
  let overgeslagen = 0;
  let leegOpRij = 0;
  let laatsteDatum = "";

  const skip = reden => {
    overgeslagen++;
    redenen[reden] = (redenen[reden] || 0) + 1;
  };

  for (let r = kopRij + 1; r <= max; r++) {
    const row = ws.getRow(r);
    if (isTotaalRij(row, map)) break;
    if (rijIsLeeg(row, map)) {
      leegOpRij++;
      if (leegOpRij >= 40) break;
      continue;
    }
    leegOpRij = 0;

    const f = String(celVanRol(row, map, "vertrek") || "").trim();
    const t = String(celVanRol(row, map, "bestemming") || "").trim();
    if (!f || !t) {
      skip("geen-route");
      continue;
    }

    const ymd0 = parseYmd(celVanRol(row, map, "datum"), jaar);
    const ymd = pasDatumSwapToe(ymd0, swap);
    let d = ymd ? isoYmd(ymd.y || jaar, ymd.m, ymd.d) : "";
    if (d) laatsteDatum = d;
    else if (laatsteDatum) d = laatsteDatum;
    if (!d) {
      skip("geen-datum");
      continue;
    }

    const nacht = isNachtCel(celVanRol(row, map, "nacht"));
    const ti = nachtUur(parseTijd(celVanRol(row, map, "uur")), nacht === true);

    let km = alsGetal(celVanRol(row, map, "km"));
    if (!Number.isFinite(km) || km <= 0) km = kmVoorRoute(kmKaart, f, t);
    if (!Number.isFinite(km) || km <= 0) {
      const sch = alsGetal(celVanRol(row, map, "schijven"));
      if (Number.isFinite(sch) && sch >= 1) km = sch * KM_SCHIJF;
    }
    if (!Number.isFinite(km) || km <= 0) {
      km = kmUitBedrag(alsGetal(celVanRol(row, map, "basis")), params.prijs, params.opstart);
    }
    if (!Number.isFinite(km) || km <= 0) {
      km = kmUitBedrag(alsGetal(celVanRol(row, map, "excl")), params.prijs, params.opstart);
    }
    if (!Number.isFinite(km) || km <= 0) {
      skip("geen-km");
      continue;
    }
    const k = Math.max(1, Math.round(km));

    let v = alsGetal(celVanRol(row, map, "excl"));
    if (!Number.isFinite(v)) {
      const basis = alsGetal(celVanRol(row, map, "basis"));
      const nt = alsGetal(celVanRol(row, map, "nachtToeslag"));
      if (Number.isFinite(basis) || Number.isFinite(nt)) v = (Number.isFinite(basis) ? basis : 0) + (Number.isFinite(nt) ? nt : 0);
    }
    if (!Number.isFinite(v) || v < 0) {
      v = vergoedingVoorRit(k, ti, { fromName: f, toName: t });
    }
    v = r2euro(v);

    const bonRaw = celVanRol(row, map, "bon");
    let bon = "";
    if (bonRaw != null && bonRaw !== "") {
      if (typeof bonRaw === "number" && Number.isFinite(bonRaw)) bon = String(Math.round(bonRaw));
      else bon = String(bonRaw).trim();
    }

    regels.push({ bon, d, ti, f, t, k, v });
  }

  return { regels: voegGesplitsteBonsSamen(regels), overgeslagen, redenen };
}

/**
 * Excel-buffer → ritten voor de app (`{d,ti,f,t,k,v,bon,s}`).
 * @param {ArrayBuffer|Uint8Array|Buffer} input
 * @param {{ bestandsnaam?: string, chauffeur?: string, voertuig?: string, maakId?: () => string, nu?: Date }} [opts]
 */
export async function leesRittenExcel(input, opts = {}) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(input);
  const { regels, overgeslagen, redenen } = parseRittenExcelWorkbook(wb, opts);
  const maakId = typeof opts.maakId === "function" ? opts.maakId : () => `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
  const chauffeur = opts.chauffeur || "";
  const voertuig = opts.voertuig || "";
  const ritten = regels.map(g => {
    const tarief = r2euro(vergoedingVoorRit(g.k, g.ti || "", { fromName: g.f, toName: g.t }));
    const trip = {
      id: maakId(),
      d: g.d,
      ti: g.ti || "",
      f: g.f,
      t: g.t,
      k: g.k,
      dr: chauffeur,
      ca: voertuig,
      s: "voltooid",
      v: g.v,
    };
    if (g.bon) trip.bon = g.bon;
    if (Math.abs(g.v - tarief) > 0.004) trip.handmatigKv = true;
    return trip;
  });
  return { ritten, overgeslagen, redenen, gevonden: regels.length };
}

function bonSleutels(bon) {
  return String(bon || "")
    .split(/[,;/|\n\r]+/)
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);
}

export function meldingExcelInlees({ toegevoegd, duplicaten, overgeslagen }) {
  if (!toegevoegd && !duplicaten) {
    return "Geen ritten gevonden in dit bestand. Gebruik een rittenlijst met Vertrek, Bestemming en Datum.";
  }
  const stukken = [toegevoegd === 1 ? "1 rit is ingelezen." : `${toegevoegd} ritten zijn ingelezen.`];
  if (duplicaten) stukken.push(duplicaten === 1 ? "1 stond al in de lijst." : `${duplicaten} stonden al in de lijst.`);
  if (overgeslagen) stukken.push(overgeslagen === 1 ? "1 regel overgeslagen." : `${overgeslagen} regels overgeslagen.`);
  return stukken.join(" ");
}

/** Voegt ingelezen ritten toe; bestaande bonnummers worden overgeslagen. */
export function voegExcelRittenToe(bestaande, nieuw) {
  const seen = new Set();
  for (const r of bestaande || []) {
    for (const b of bonSleutels(r.bon)) seen.add(b);
  }
  const toegevoegd = [];
  let duplicaten = 0;
  for (const r of nieuw || []) {
    const bons = bonSleutels(r.bon);
    if (bons.length && bons.every(b => seen.has(b))) {
      duplicaten++;
      continue;
    }
    for (const b of bons) seen.add(b);
    toegevoegd.push(r);
  }
  return { ritten: [...(bestaande || []), ...toegevoegd], toegevoegd, duplicaten };
}
