/**
 * Berekeningen – vergoeding, datums, totalen, km
 */

import {
  OPSTART_PREMIE,
  VERGOEDING_PER_20KM,
  KM_SCHIJF,
  NACHT_TARIEF_FACTOR,
  NACHT_START_UUR,
  NACHT_EIND_UUR,
  GESCHAT_VERBRUIK_L_PER_100KM,
  NACHT_TOESLAG_PERCENT,
  FORFAIT_SANGO_UZA_EXCL_BTW,
} from './config.js';
import { getData } from './storage.js';

function parseUurUitTijd(tijd) {
  if (!tijd || typeof tijd !== 'string') return null;
  const m = tijd.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const uur = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(uur) || !Number.isFinite(min) || uur < 0 || uur > 23 || min < 0 || min > 59) return null;
  return uur;
}

export function isNachtTariefTijd(tijd) {
  const uur = parseUurUitTijd(tijd);
  if (uur == null) return false;
  return uur >= NACHT_START_UUR || uur < NACHT_EIND_UUR;
}

function normLocNaam(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[()[\]{}]/g, ' ')
    .replace(/\s*\/\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function heeftSangoInNaam(s) {
  return normLocNaam(s).includes('sango');
}

function heeftEdegemUzaInNaam(s) {
  const n = normLocNaam(s);
  if (!n.includes('edegem')) return false;
  return (
    n.includes('uza') ||
    n.includes('uz antwerpen') ||
    n.includes('uzantwerpen') ||
    (n.includes('uz') && n.includes('antwerpen'))
  );
}

/** RKV Sango → UZA Edegem (richting): helpt forfait-paar te herkennen. */
export function isSangoNaarEdegemUzaRoute(fromName, toName) {
  return heeftSangoInNaam(fromName) && heeftEdegemUzaInNaam(toName);
}

/** Beide richtingen: forfait €35 (excl. btw) i.p.v. km-formule. */
export function isSangoUzaForfaitRoute(fromName, toName) {
  return (
    isSangoNaarEdegemUzaRoute(fromName, toName) ||
    (heeftEdegemUzaInNaam(fromName) && heeftSangoInNaam(toName))
  );
}

/** RKV Mechelen (geen AZ Mechelen): naam bevat mechelen + (rkv|reinier). */
function heeftRkvMechelenInNaam(s) {
  const n = normLocNaam(s);
  if (!n.includes('mechelen')) return false;
  if (n.includes('az') && n.includes('mechelen') && !n.includes('rkv')) return false;
  return n.includes('rkv') || n.includes('reinier');
}

/** RKV Mechelen → UZA Edegem (richting): helpt forfait-paar te herkennen. */
export function isRkvMechelenNaarEdegemUzaRoute(fromName, toName) {
  return heeftRkvMechelenInNaam(fromName) && heeftEdegemUzaInNaam(toName);
}

/** Beide richtingen: zelfde forfait €35 als Sango ↔ UZA (excl. btw). */
export function isRkvMechelenUzaForfaitRoute(fromName, toName) {
  return (
    isRkvMechelenNaarEdegemUzaRoute(fromName, toName) ||
    (heeftEdegemUzaInNaam(fromName) && heeftRkvMechelenInNaam(toName))
  );
}

/** Aantal te factureren schijven: ’s nachts ceil(schijven × 1,3), anders gewoon schijven. */
function schijvenMetNachttarief(schijven, nacht) {
  const s = Math.max(0, Number(schijven) || 0);
  if (!nacht) return s;
  return Math.max(s, Math.ceil(s * NACHT_TARIEF_FACTOR));
}

function vergoedingVoorRitAlleenKm(km, tijd) {
  const k = Number(km) || 0;
  const schijven = Math.ceil(k / KM_SCHIJF);
  const nacht = isNachtTariefTijd(tijd);
  const schijvenBillable = schijvenMetNachttarief(schijven, nacht);
  const variabelMetTarief = schijvenBillable * VERGOEDING_PER_20KM;
  return Math.round((OPSTART_PREMIE + variabelMetTarief) * 100) / 100;
}

/**
 * @param {number} km
 * @param {string} [tijd]
 * @param {{ fromName?: string, toName?: string }} [route] — bij vertrek/bestemming: Sango↔UZA- of RKV Mechelen↔UZA-forfait.
 */
export function vergoedingVoorRit(km, tijd, route) {
  const fromName = route?.fromName;
  const toName = route?.toName;
  const heeftBeideNamen =
    String(fromName || '').trim().length > 0 && String(toName || '').trim().length > 0;

  const isUzaForfaitPaar =
    heeftBeideNamen &&
    (isSangoUzaForfaitRoute(fromName, toName) || isRkvMechelenUzaForfaitRoute(fromName, toName));
  if (isUzaForfaitPaar) {
    return FORFAIT_SANGO_UZA_EXCL_BTW;
  }
  return vergoedingVoorRitAlleenKm(km, tijd);
}

/**
 * Uitsplitsing km-formule: opstart, km-deel op basis schijven; ’s nachts +NACHT_TOESLAG_PERCENT% op het aantal schijven (ceil naar hele schijven).
 */
export function vergoedingUitsplitsingKmFormule(km, tijd) {
  const k = Number(km) || 0;
  const schijven = Math.max(0, Math.ceil(k / KM_SCHIJF));
  const nacht = isNachtTariefTijd(tijd);
  const schijvenBillable = schijvenMetNachttarief(schijven, nacht);
  const variabelDeel = schijven * VERGOEDING_PER_20KM;
  const variabelMetTarief = schijvenBillable * VERGOEDING_PER_20KM;
  const nachtToeslagEuro = Math.round((variabelMetTarief - variabelDeel) * 100) / 100;
  const vergoeding = Math.round((OPSTART_PREMIE + variabelMetTarief) * 100) / 100;
  return {
    opstartEuro: OPSTART_PREMIE,
    variabelDeel,
    schijven,
    schijvenBillable,
    isNacht: nacht,
    nachtToeslagEuro,
    nachtToeslagPercent: NACHT_TOESLAG_PERCENT,
    vergoeding,
  };
}

/**
 * Zelfde logica als vergoedingVoorRit(km, tijd, route) voor uitleg in UI (forfait / nacht op schijven).
 */
export function vergoedingUitsplitsingVoorRit(km, tijd, route) {
  const fromName = route?.fromName;
  const toName = route?.toName;
  const heeftBeideNamen =
    String(fromName || '').trim().length > 0 && String(toName || '').trim().length > 0;

  const isUzaForfaitPaar =
    heeftBeideNamen &&
    (isSangoUzaForfaitRoute(fromName, toName) || isRkvMechelenUzaForfaitRoute(fromName, toName));
  if (isUzaForfaitPaar) {
    const basis = FORFAIT_SANGO_UZA_EXCL_BTW;
    return {
      isSangoUzaForfait: true,
      forfaitBasis: basis,
      isNacht: false,
      nachtToeslagEuro: 0,
      nachtToeslagPercent: NACHT_TOESLAG_PERCENT,
      routeToeslagEuro: 0,
      vergoeding: basis,
    };
  }

  const u = vergoedingUitsplitsingKmFormule(km, tijd);
  return {
    ...u,
    isSangoUzaForfait: false,
    routeToeslagEuro: 0,
    vergoeding: u.vergoeding,
  };
}

/**
 * Alleen voor interne/legacy-schatting — geen vervanging van echte autoroute (getDrivingRouteKm).
 */
export function geschatteAfstandKm(from, to) {
  if (from?.lat == null || to?.lat == null) return null;
  const R = 6371; // straal aarde in km
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((from.lat * Math.PI) / 180) * Math.cos((to.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const hemelsbreed = R * c;
  if (!Number.isFinite(hemelsbreed) || hemelsbreed <= 0) return null;
  /** Langere trajecten: lagere factor (meer snelweg); kort: hoger (lokaal omrijden). */
  const factor = 1.15 + 10 / (hemelsbreed + 15);
  const roadKm = hemelsbreed * Math.min(1.9, Math.max(1.18, factor));
  return Math.max(1, Math.round(roadKm));
}

export function toDateStr(d) {
  if (typeof d === 'string') return d.slice(0, 10);
  const date = new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse YYYY-MM-DD als lokale datum (geen timezone-probleem) */
export function parseLocalDate(str) {
  if (!str || typeof str !== 'string') return new Date(NaN);
  const part = str.slice(0, 10).split('-').map(Number);
  if (part.length !== 3) return new Date(NaN);
  return new Date(part[0], part[1] - 1, part[2]);
}

function startOfWeek(d) {
  const date = typeof d === 'string' ? parseLocalDate(d) : new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

/** Week-sleutel voor groeperen, bv. "2024-W12" */
export function getWeekKey(datumStr) {
  const d = parseLocalDate(datumStr);
  if (isNaN(d.getTime())) return '';
  const start = startOfWeek(d);
  const iso = getISOWeek(start);
  return `${iso.year}-W${String(iso.week).padStart(2, '0')}`;
}

function getISOWeek(d) {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const week1 = new Date(date.getFullYear(), 0, 4);
  const week = 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  return { year: date.getFullYear(), week };
}

/** Leesbare weeklabel, bv. "Week 12 (18–24 mrt 2024)" */
export function getWeekLabel(datumStr) {
  const d = parseLocalDate(datumStr);
  if (isNaN(d.getTime())) return datumStr;
  const start = startOfWeek(d);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const { week, year } = getISOWeek(start);
  const maanden = 'jan feb mrt apr mei jun jul aug sep okt nov dec';
  const d1 = start.getDate();
  const d2 = end.getDate();
  const m = maanden.split(' ')[end.getMonth()];
  return `Week ${week} (${d1}–${d2} ${m} ${year})`;
}

export function isInDay(entryDate, refDate) {
  return toDateStr(entryDate) === toDateStr(refDate);
}

export function isInWeek(entryDate, refDate) {
  const entry = typeof entryDate === 'string' ? parseLocalDate(entryDate) : new Date(entryDate);
  const ref = typeof refDate === 'string' ? parseLocalDate(refDate) : new Date(refDate);
  const s = startOfWeek(ref);
  const e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6, 23, 59, 59, 999);
  return entry >= s && entry <= e;
}

export function isInMonth(entryDate, refDate) {
  const entry = typeof entryDate === 'string' ? parseLocalDate(entryDate) : new Date(entryDate);
  const ref = typeof refDate === 'string' ? parseLocalDate(refDate) : new Date(refDate);
  if (isNaN(entry.getTime()) || isNaN(ref.getTime())) return false;
  return entry.getFullYear() === ref.getFullYear() && entry.getMonth() === ref.getMonth();
}

export function filterByPeriod(items, period, dateKey = 'datum') {
  const now = new Date();
  if (period === 'day') return items.filter((i) => isInDay(i[dateKey], now));
  if (period === 'week') return items.filter((i) => isInWeek(i[dateKey], now));
  if (period === 'month') return items.filter((i) => isInMonth(i[dateKey], now));
  return items;
}

/** Alleen voltooide ritten tellen voor omzet/km (oude ritten zonder status = voltooid) */
export function isRitVoltooid(rit) {
  if (rit?.status === 'geannuleerd') return false;
  return rit.status === 'voltooid' || rit.status == null;
}

export function totalenVoorPeriode(period) {
  const { ritten, brandstof, overig } = getData();
  const rAll = filterByPeriod(ritten, period);
  const r = rAll.filter(isRitVoltooid);
  const b = filterByPeriod(brandstof, period);
  const o = filterByPeriod(overig, period);

  const omzet = r.reduce(
    (sum, rit) =>
      sum +
      (rit.vergoeding ??
        vergoedingVoorRit(rit.km, rit.tijd, { fromName: rit.fromName, toName: rit.toName })),
    0
  );
  const brandstofKosten = b.reduce((sum, x) => sum + (x.prijs || 0), 0);
  const overigeKosten = o.reduce((sum, x) => sum + (x.bedrag || 0), 0);
  const winst = omzet - brandstofKosten - overigeKosten;
  const km = r.reduce((sum, rit) => sum + (rit.km || 0), 0);
  const aantalRitten = r.length;

  return { omzet, brandstofKosten, overigeKosten, winst, km, aantalRitten };
}

export function kmTotalen() {
  const { ritten } = getData();
  const now = new Date();
  const voltooid = (r) => isRitVoltooid(r);
  const day = ritten.filter((r) => isInDay(r.datum, now) && voltooid(r)).reduce((s, r) => s + (r.km || 0), 0);
  const week = ritten.filter((r) => isInWeek(r.datum, now) && voltooid(r)).reduce((s, r) => s + (r.km || 0), 0);
  const month = ritten.filter((r) => isInMonth(r.datum, now) && voltooid(r)).reduce((s, r) => s + (r.km || 0), 0);
  return { day, week, month };
}

/** Per-week data voor grafiek (laatste N weken). Weeklabel bv. "W12" of "12 mrt". */
export function getWeeklyFinancials(weeksBack = 8) {
  const { ritten, brandstof, overig } = getData();
  const now = new Date();
  const result = [];
  const maanden = 'jan feb mrt apr mei jun jul aug sep okt nov dec';
  for (let w = 0; w < weeksBack; w++) {
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - (now.getDay() || 7) + 1 - w * 7);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    const r = ritten.filter(
      (rit) => isRitVoltooid(rit) && new Date(rit.datum) >= weekStart && new Date(rit.datum) <= weekEnd
    );
    const b = brandstof.filter((x) => new Date(x.datum) >= weekStart && new Date(x.datum) <= weekEnd);
    const o = overig.filter((x) => new Date(x.datum) >= weekStart && new Date(x.datum) <= weekEnd);
    const omzet = r.reduce(
    (sum, rit) =>
      sum +
      (rit.vergoeding ??
        vergoedingVoorRit(rit.km, rit.tijd, { fromName: rit.fromName, toName: rit.toName })),
    0
  );
    const brandstofKosten = b.reduce((sum, x) => sum + (x.prijs || 0), 0);
    const overigeKosten = o.reduce((sum, x) => sum + (x.bedrag || 0), 0);
    const winst = omzet - brandstofKosten - overigeKosten;
    const weekNum = getISOWeek(weekStart).week;
    const label = `W${weekNum} ${weekStart.getDate()} ${maanden.split(' ')[weekStart.getMonth()]}`;
    const shortLabel = `W${weekNum}`;
    result.unshift({ label, shortLabel, omzet, brandstofKosten, overigeKosten, winst });
  }
  return result;
}

/**
 * Gemiddelde benzinekost per km (totaal benzine / totaal km van alle ritten).
 * Nog bruikbaar voor trends; voor nieuwe ritten gebruiken we liever 5 L/100 km × gem. €/L.
 */
export function getGemiddeldeBenzineKostPerKm() {
  const { ritten, brandstof } = getData();
  const totaalKm = ritten.filter(isRitVoltooid).reduce((s, r) => s + (r.km || 0), 0);
  const totaalBenzine = brandstof.reduce((s, b) => s + (b.prijs || 0), 0);
  if (totaalKm <= 0 || totaalBenzine < 0) return null;
  return totaalBenzine / totaalKm;
}

/** Gemiddelde prijs per liter uit tankbeurten (som € / som L). */
export function getGemiddeldeLiterPrijsPerLiter() {
  const { brandstof } = getData();
  const totLiter = brandstof.reduce((s, b) => s + (Number(b.liter) || 0), 0);
  const totPrijs = brandstof.reduce((s, b) => s + (Number(b.prijs) || 0), 0);
  if (totLiter <= 0 || totPrijs < 0) return null;
  return totPrijs / totLiter;
}

/** Geschatte brandstofkosten: km × (L/100) × €/L. */
export function geschatteBrandstofKosten5L100(km, euroPerLiter) {
  const k = Number(km) || 0;
  const p = Number(euroPerLiter);
  if (k <= 0 || !Number.isFinite(p) || p < 0) return null;
  const raw = k * (GESCHAT_VERBRUIK_L_PER_100KM / 100) * p;
  return Math.round(raw * 100) / 100;
}

/**
 * Voor een rit van X km: vergoeding, geschatte benzine (5 L/100 × gem. €/L) en geschatte winst.
 */
export function rendabiliteitRit(km, tijd) {
  if (!km || km < 0) return null;
  const vergoeding = vergoedingVoorRit(km, tijd);
  const literPrijs = getGemiddeldeLiterPrijsPerLiter();
  const uitsplitsing = vergoedingUitsplitsingKmFormule(km, tijd);
  if (literPrijs == null) {
    return {
      vergoeding,
      geschatteBenzine: null,
      geschatteWinst: null,
      literPrijsGemiddeld: null,
      uitsplitsing,
    };
  }
  const geschatteBenzine = geschatteBrandstofKosten5L100(km, literPrijs);
  if (geschatteBenzine == null) {
    return {
      vergoeding,
      geschatteBenzine: null,
      geschatteWinst: null,
      literPrijsGemiddeld: literPrijs,
      uitsplitsing,
    };
  }
  const geschatteWinst = Math.round((vergoeding - geschatteBenzine) * 100) / 100;
  return { vergoeding, geschatteBenzine, geschatteWinst, literPrijsGemiddeld: literPrijs, uitsplitsing };
}

/** Preset exact deze volgorde (geen omgekeerde match — forfait vaak richting-specifiek). */
export function findPresetExact(presets, fromId, toId) {
  if (!fromId || !toId || !Array.isArray(presets)) return null;
  return presets.find((p) => p.fromId === fromId && p.toId === toId) ?? null;
}

/**
 * Vergoeding: optioneel forfait op vaste route (minstens 1 km ingevuld), anders km-formule.
 */
export function vergoedingFromPresetOrKm(preset, km, tijd, route) {
  const raw = preset?.forfaitVergoeding;
  if (km >= 1 && raw != null && Number.isFinite(Number(raw))) {
    return Math.round(Number(raw) * 100) / 100;
  }
  return vergoedingVoorRit(km, tijd, route);
}

/**
 * Zelfde als rendabiliteitRit maar met optioneel forfait op preset (nieuwe-rit formulier).
 * Nachttoeslag in uitsplitsing alleen bij km-formule (op km-deel), niet bij forfait-preset.
 */
export function rendabiliteitRitForForm(km, tijd, preset, route) {
  if (!km || km < 0) return null;
  const vergoeding = vergoedingFromPresetOrKm(preset, km, tijd, route);
  const raw = preset?.forfaitVergoeding;
  const isForfait =
    km >= 1 && raw != null && Number.isFinite(Number(raw)) && Number(raw) >= 0;
  const uitsplitsing = isForfait ? null : vergoedingUitsplitsingVoorRit(km, tijd, route);
  const literPrijs = getGemiddeldeLiterPrijsPerLiter();
  if (literPrijs == null) {
    return {
      vergoeding,
      geschatteBenzine: null,
      geschatteWinst: null,
      literPrijsGemiddeld: null,
      uitsplitsing,
      isForfait,
    };
  }
  const geschatteBenzine = geschatteBrandstofKosten5L100(km, literPrijs);
  if (geschatteBenzine == null) {
    return {
      vergoeding,
      geschatteBenzine: null,
      geschatteWinst: null,
      literPrijsGemiddeld: literPrijs,
      uitsplitsing,
      isForfait,
    };
  }
  const geschatteWinst = Math.round((vergoeding - geschatteBenzine) * 100) / 100;
  return {
    vergoeding,
    geschatteBenzine,
    geschatteWinst,
    literPrijsGemiddeld: literPrijs,
    uitsplitsing,
    isForfait,
  };
}
