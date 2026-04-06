/**
 * Tekst van een leveringsbon (OCR): bestelnummers, tijden, datum, km.
 * NL/FR/EN woorden op bonnen worden meegenomen.
 */

import { parseDatum } from './ocr.js';

function normalizeBonCandidate(s) {
  if (typeof s !== 'string') return '';
  let t = s.replace(/\u200B/g, '').replace(/\*/g, '').trim();
  if (t.length < 4) return '';
  if (/^\d{1,2}[:.h]\d{2}$/i.test(t)) return '';
  if (/^20\d{2}$/.test(t) && t.length === 4) return '';
  if (!/[0-9A-Za-z]/.test(t)) return '';
  t = t.replace(/\s+/g, '');
  if (t.length >= 6 && /^[0-9]+$/.test(t)) return t;
  if (/^[A-Za-z0-9]+$/.test(t) && t.length >= 5) return t;
  const runs = t.match(/[A-Za-z0-9]+/g);
  if (!runs?.length) return '';
  runs.sort((a, b) => b.length - a.length);
  return runs[0].length >= 4 ? runs[0] : '';
}

export function normalizeBonKey(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function parseTijdenUitRaw(raw) {
  const tijden = [];
  const re = /\b([01]?\d|2[0-3])[:.h]([0-5]\d)\b/gi;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const h = Math.min(23, parseInt(m[1], 10));
    const min = m[2].padStart(2, '0');
    tijden.push(`${String(h).padStart(2, '0')}:${min}`);
  }
  const seen = new Set();
  return tijden.filter((t) => {
    if (seen.has(t)) return false;
    seen.add(t);
    return true;
  });
}

const KEY_VERTREK =
  /vertrek|depart|vert\.|start|begin|u\s*vert|heure\s*de\s*d|départ|partenza/i;
const KEY_AANKOMST =
  /aankom|arriv|ariv|einde|fin\b|tot\b|heure\s*d\s*a|arrivée|destination|livraison/i;

/**
 * @param {string} text
 * @returns {{
 *   datum: string | null,
 *   bonnummers: string[],
 *   tijden: string[],
 *   vertrekTijd: string | null,
 *   aankomstTijd: string | null,
 *   km: number | null,
 *   rawSnippet: string,
 * }}
 */
export function parseBonSlipText(text) {
  const raw = typeof text === 'string' ? text : '';
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const tijden = parseTijdenUitRaw(raw);

  let vertrekTijd = null;
  let aankomstTijd = null;
  for (const line of lines) {
    const low = line.toLowerCase();
    const tm = line.match(/\b([01]?\d|2[0-3])[:.h]([0-5]\d)\b/i);
    if (!tm) continue;
    const h = Math.min(23, parseInt(tm[1], 10));
    const t = `${String(h).padStart(2, '0')}:${tm[2].padStart(2, '0')}`;
    if (KEY_VERTREK.test(line) || KEY_VERTREK.test(low)) vertrekTijd = t;
    if (KEY_AANKOMST.test(line) || KEY_AANKOMST.test(low)) aankomstTijd = t;
  }

  if (!vertrekTijd && tijden.length >= 1) vertrekTijd = tijden[0];
  if (!aankomstTijd && tijden.length >= 2) aankomstTijd = tijden[tijden.length - 1];
  if (!aankomstTijd && tijden.length === 1) aankomstTijd = tijden[0];

  let km = null;
  const kmM = raw.match(/\b(\d{1,3})\s*km\b/i);
  if (kmM) {
    const k = parseInt(kmM[1], 10);
    if (Number.isFinite(k) && k >= 1 && k <= 900) km = k;
  }

  const bons = new Set();
  const keywordLine =
    /bestel|bon\s*nr|order|ref\.?|referent|artikel|livraison|commande|nr\.?\s*$/i;

  for (const line of lines) {
    if (keywordLine.test(line)) {
      const parts = line.match(/[A-Za-z0-9*]{4,}/g) || [];
      for (const p of parts) {
        const n = normalizeBonCandidate(p);
        if (n) bons.add(n);
      }
    }
  }

  const globalRuns = raw.match(/[A-Za-z0-9*]{7,}/g) || [];
  for (const p of globalRuns) {
    if (/^20\d{2}[-./]\d{1,2}[-./]\d{1,2}$/.test(p)) continue;
    const n = normalizeBonCandidate(p.replace(/\*/g, ''));
    if (n) bons.add(n);
  }

  return {
    datum: parseDatum(raw),
    bonnummers: [...bons],
    tijden,
    vertrekTijd,
    aankomstTijd,
    km,
    rawSnippet: raw.slice(0, 900),
  };
}
