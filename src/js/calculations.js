/**
 * Berekeningen – vergoeding, datums, totalen, km
 */

import { OPSTART_PREMIE, VERGOEDING_PER_20KM, KM_SCHIJF } from './config.js';
import { getData } from './storage.js';

export function vergoedingVoorRit(km) {
  const schijven = Math.ceil(km / KM_SCHIJF);
  return OPSTART_PREMIE + schijven * VERGOEDING_PER_20KM;
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

export function totalenVoorPeriode(period) {
  const { ritten, brandstof, overig } = getData();
  const r = filterByPeriod(ritten, period);
  const b = filterByPeriod(brandstof, period);
  const o = filterByPeriod(overig, period);

  const omzet = r.reduce((sum, rit) => sum + (rit.vergoeding ?? vergoedingVoorRit(rit.km)), 0);
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
  const day = ritten.filter((r) => isInDay(r.datum, now)).reduce((s, r) => s + (r.km || 0), 0);
  const week = ritten.filter((r) => isInWeek(r.datum, now)).reduce((s, r) => s + (r.km || 0), 0);
  const month = ritten.filter((r) => isInMonth(r.datum, now)).reduce((s, r) => s + (r.km || 0), 0);
  return { day, week, month };
}

/**
 * Gemiddelde benzinekost per km (totaal benzine / totaal km van alle ritten).
 * Gebruikt voor geschatte rendabiliteit van een nieuwe rit.
 */
export function getGemiddeldeBenzineKostPerKm() {
  const { ritten, brandstof } = getData();
  const totaalKm = ritten.reduce((s, r) => s + (r.km || 0), 0);
  const totaalBenzine = brandstof.reduce((s, b) => s + (b.prijs || 0), 0);
  if (totaalKm <= 0 || totaalBenzine < 0) return null;
  return totaalBenzine / totaalKm;
}

/**
 * Voor een rit van X km: vergoeding, geschatte benzinekosten en geschatte winst.
 * Geschatte winst = vergoeding − (km × gem. €/km). Null als we geen gemiddelde hebben.
 */
export function rendabiliteitRit(km) {
  if (!km || km < 0) return null;
  const vergoeding = vergoedingVoorRit(km);
  const euroPerKm = getGemiddeldeBenzineKostPerKm();
  if (euroPerKm == null) return { vergoeding, geschatteBenzine: null, geschatteWinst: null };
  const geschatteBenzine = km * euroPerKm;
  const geschatteWinst = vergoeding - geschatteBenzine;
  return { vergoeding, geschatteBenzine, geschatteWinst };
}
