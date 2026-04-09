/**
 * Genereert een PDF-factuur (zelfde layout als Meer → Financieel → PDF) uit
 * data/beheer-factuur-april-2026.json — zonder browser/localStorage.
 *
 * Gebruik: node scripts/generate-beheer-factuur.mjs [pad-naar-json]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { generateFactuurPdfBlob } from '../src/js/invoicePdf.js';
import { vergoedingVoorRit } from '../src/js/calculations.js';
import { formatDatumKort } from '../src/js/format.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const DEFAULT_FACTUUR = {
  logoDataUrl: '',
  bedrijfsnaam: '',
  adresStraat: '',
  adresPostcodeStad: '',
  land: 'België',
  btwNummer: '',
  rekeninghouder: '',
  iban: '',
  email: '',
  telefoon: '',
  klantNaam: '',
  klantBedrijfsnaam: '',
  klantContactpersoon: '',
  klantBtw: '',
  klantAdres: '',
  klantLand: 'België',
  factuurBtwAanrekenen: false,
  factuurBtwTarief: 21,
  btwVrijstellingTekst:
    'Bijzondere vrijstellingsregeling kleine ondernemingen - btw niet van toepassing',
  vervalDagen: 30,
};

function mergeFactuurSettings(partial) {
  const o = partial && typeof partial === 'object' ? partial : {};
  return { ...DEFAULT_FACTUUR, ...o };
}

function ritVergoeding(r, fallbackKm) {
  if (r.vergoeding != null && Number.isFinite(Number(r.vergoeding))) {
    return Math.round(Number(r.vergoeding) * 100) / 100;
  }
  const km = r.km != null && Number.isFinite(Number(r.km)) ? Number(r.km) : fallbackKm;
  return vergoedingVoorRit(km, r.tijd || '12:00', {
    fromName: r.fromName,
    toName: r.toName,
  });
}

function ritNaarRegel(r, fallbackKm) {
  const tijdWeergave = String(r.tijd || '').trim() || '';
  const datumWeergave = formatDatumKort(r.datum, tijdWeergave);
  const orderBon = String(r.order || r.bonnummer || '').trim() || '—';
  const ophaal = String(r.fromName || '').trim() || '—';
  const aflevering = String(r.toName || '').trim() || '—';
  const kmVal = r.km != null && Number.isFinite(Number(r.km)) ? String(r.km) : String(fallbackKm);
  const bedrag = ritVergoeding(r, fallbackKm);
  return {
    titel: 'Dienstverlening: ziekenhuisvervoer',
    prijsExcl: bedrag,
    totaal: bedrag,
    datumWeergave,
    orderBon,
    ophaal,
    aflevering,
    km: kmVal,
  };
}

function parseIsoDate(s) {
  const t = String(s || '').trim().slice(0, 10);
  const d = new Date(`${t}T12:00:00`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

async function main() {
  const jsonPath = path.resolve(
    process.argv[2] || path.join(root, 'data/beheer-factuur-april-2026.json')
  );
  const raw = fs.readFileSync(jsonPath, 'utf8');
  const data = JSON.parse(raw);
  const fallbackKm = Number(data.fallbackKm);
  const kmDefault = Number.isFinite(fallbackKm) && fallbackKm >= 0 ? fallbackKm : 48;

  const factuurSettings = mergeFactuurSettings(data.factuurSettings);
  const logoPath = data.logoPath
    ? path.resolve(path.dirname(jsonPath), data.logoPath)
    : path.join(root, 'data/hoho-logo.png');
  if (
    !String(factuurSettings.logoDataUrl || '').startsWith('data:image') &&
    fs.existsSync(logoPath)
  ) {
    const b64 = fs.readFileSync(logoPath).toString('base64');
    const ext = path.extname(logoPath).toLowerCase();
    const mime =
      ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : ext === '.webp'
          ? 'image/webp'
          : 'image/png';
    factuurSettings.logoDataUrl = `data:${mime};base64,${b64}`;
  }
  const metaRaw = data.meta || {};
  const factuurDatum = parseIsoDate(metaRaw.factuurDatum);
  const vervalDatum = parseIsoDate(metaRaw.vervalDatum);
  const factuurCode = String(metaRaw.factuurCode || '2026-000').trim();
  const orderDisplay = String(metaRaw.orderDisplay || '000').trim();

  const ritten = Array.isArray(data.ritten) ? [...data.ritten] : [];
  ritten.sort((a, b) => {
    const da = `${a.datum || ''} ${a.tijd || ''}`;
    const db = `${b.datum || ''} ${b.tijd || ''}`;
    return da.localeCompare(db);
  });

  const regels = ritten.map((r) => ritNaarRegel(r, kmDefault));

  const { blob } = await generateFactuurPdfBlob({
    factuurSettings,
    meta: { factuurCode, orderDisplay, factuurDatum, vervalDatum },
    regels,
  });

  const buf =
    typeof blob?.arrayBuffer === 'function'
      ? Buffer.from(await blob.arrayBuffer())
      : Buffer.from(blob);
  const base = path.basename(jsonPath, path.extname(jsonPath));
  const outPath = path.join(path.dirname(jsonPath), `${base}.pdf`);
  fs.writeFileSync(outPath, buf);
  console.log('PDF geschreven:', outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
