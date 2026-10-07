/**
 * Rittenlijst als Excel (.xlsx), in hetzelfde formaat als het klantsjabloon "Rittenregistratie":
 * rij 1 parameters, rij 2 toelichting, rij 3 koppen, vanaf rij 4 één regel per bon, onderaan TOTAAL.
 * Bedragen komen uit de opgeslagen ritten (zelfde als de PDF-factuur); BTW en totalen zijn formules.
 */
import { vergoedingUitsplitsingVoorRit, isNachtTariefTijd } from "./calculations.js";
import { OPSTART_PREMIE, VERGOEDING_PER_20KM, NACHT_TOESLAG_PERCENT, KM_SCHIJF } from "./config.js";

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
