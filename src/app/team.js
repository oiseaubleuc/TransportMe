/**
 * Teamgegevens: alle chauffeurs (profielen) samen, voor de beheerdersweergaven.
 * Elke chauffeur houdt zijn eigen opslag (t_<id>); hier wordt alles samengevoegd.
 */
import { PR, money, ritKmValue, toIsoLocal } from "../TransportMe.jsx";

/** Vaste kleur per chauffeur (index in PR) — komt overeen met --l1..--l4 in app.css. */
export const LIJN_HEX = {
  light: ["#2F5BEA", "#C98A00", "#0E9467", "#8A4FD6"],
  dark: ["#7895FF", "#F2B630", "#3CC98F", "#B48AF0"],
};

export function chauffeurIndex(pid) {
  const i = PR.findIndex(p => p.id === pid);
  return i < 0 ? 0 : i;
}

export function lijnVar(pid) {
  return `var(--l${(chauffeurIndex(pid) % 4) + 1})`;
}

export function chauffeurNaam(pid) {
  return (PR.find(p => p.id === pid) || PR[0]).n;
}

export const ritSortKey = r => (r.d || "") + " " + (r.ti || "00:00");

export function minutenVan(ti) {
  const m = String(ti || "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return +m[1] * 60 + +m[2];
}

/** Geschatte rijduur in minuten (voor de dagkaart): rijden aan ±70 km/u + laden/lossen. */
export function geschatteDuur(r) {
  const k = ritKmValue(r);
  return Math.max(30, Math.round((k / 70) * 60) + 15);
}

export function isoPlusDagen(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 12);
  dt.setDate(dt.getDate() + n);
  return toIsoLocal(dt);
}

export function vandaagIso() {
  return toIsoLocal(new Date());
}

export function weekStart(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 12);
  const wd = dt.getDay();
  dt.setDate(dt.getDate() - (wd === 0 ? 6 : wd - 1));
  return toIsoLocal(dt);
}

/** Periodes voor Financieel. */
export function periodeBereik(k, ref = vandaagIso()) {
  const [y, m] = ref.split("-").map(Number);
  if (k === "week") {
    const s = weekStart(ref);
    return [s, isoPlusDagen(s, 6)];
  }
  if (k === "vorigemaand") {
    return [toIsoLocal(new Date(y, m - 2, 1, 12)), toIsoLocal(new Date(y, m - 1, 0, 12))];
  }
  if (k === "jaar") return [`${y}-01-01`, `${y}-12-31`];
  return [toIsoLocal(new Date(y, m - 1, 1, 12)), toIsoLocal(new Date(y, m, 0, 12))];
}

const inR = (d, s, e) => d >= s && d <= e;

/** Totalen voor één chauffeur over een periode. */
export function totalen(D, s, e) {
  const ritten = D.r.filter(r => r.s === "voltooid" && inR(r.d, s, e));
  const omzet = ritten.reduce((a, r) => a + money(r.v), 0);
  const km = ritten.reduce((a, r) => a + ritKmValue(r), 0);
  const brandstof = D.b.filter(b => inR(b.d, s, e)).reduce((a, b) => a + money(b.a), 0);
  const overig = (D.o || []).filter(x => inR(x.d, s, e)).reduce((a, x) => a + money(x.a), 0);
  const kosten = brandstof + overig;
  return { ritten: ritten.length, omzet, km, brandstof, overig, kosten, netto: omzet - kosten };
}

export function somTotalen(lijst) {
  const t = { ritten: 0, omzet: 0, km: 0, brandstof: 0, overig: 0, kosten: 0, netto: 0 };
  lijst.forEach(x => Object.keys(t).forEach(k => (t[k] += x[k])));
  return t;
}

/** "€1.234" (zonder centen) voor grote getallen in overzichten; E() blijft voor exacte bedragen. */
export function euroKort(n) {
  const x = Math.round(money(n));
  return (x < 0 ? "−€" : "€") + Math.abs(x).toLocaleString("nl-BE");
}

export function euro(n) {
  const x = money(n);
  return (
    (x < 0 ? "−€" : "€") +
    Math.abs(x).toLocaleString("nl-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

export function dagLabel(iso, vandaag = vandaagIso()) {
  if (iso === vandaag) return "Vandaag";
  if (iso === isoPlusDagen(vandaag, 1)) return "Morgen";
  if (iso === isoPlusDagen(vandaag, -1)) return "Gisteren";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 12);
  const opts = { weekday: "long", day: "numeric", month: "long" };
  if (y !== +vandaag.slice(0, 4)) opts.year = "numeric";
  const s = dt.toLocaleDateString("nl-BE", opts);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function datumLang(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const s = new Date(y, m - 1, d, 12).toLocaleDateString("nl-BE", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function datumKort(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString("nl-BE", { day: "numeric", month: "short" });
}

const GETAL = ["geen", "één", "twee", "drie", "vier", "vijf", "zes", "zeven", "acht", "negen", "tien"];
export function telwoord(n) {
  return n >= 0 && n <= 10 ? GETAL[n] : String(n);
}

export function meervoud(n, een, meer) {
  return `${n} ${n === 1 ? een : meer}`;
}
