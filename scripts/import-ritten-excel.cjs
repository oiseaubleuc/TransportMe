/**
 * Leest ritten_vergoeding_v2.xlsx en genereert DEFAULT_ZIEKENHUIZEN + DEFAULT_PRESET_ROUTES
 * Gebruik: node scripts/import-ritten-excel.cjs [pad/naar/ritten_vergoeding_v2.xlsx]
 */

const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const excelPath = process.argv[2] || path.join(process.cwd(), 'ritten_vergoeding_v2.xlsx');
if (!fs.existsSync(excelPath)) {
  console.error('Bestand niet gevonden:', excelPath);
  process.exit(1);
}

const wb = XLSX.readFile(excelPath);
const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });

const rows = data.slice(1).filter(
  (r) => r[0] && r[1] && typeof r[2] === 'number' && String(r[0]).toUpperCase() !== 'TOTAAL' && !String(r[0]).startsWith('Formule')
);

// Excel naam -> id (zelfde als in bestaande config.js)
const nameToId = {
  'UZ Brussel': 'uz-brussel',
  'UZ Leuven': 'uz-leuven',
  'UZA (Edegem)': 'uza',
  'AZ Deurne (AZ Monica)': 'deurne',
  'AZ Herentals': 'herentals',
  'AZ Mechelen': 'mechelen',
  'AZ Gent': 'gent',
  'ZOL Genk': 'genk',
  'AZ Turnhout': 'az-turnhout',
  'AZ Mol (Hart)': 'mol',
  'AZ Mol': 'mol',
  'AZ Klina Brasschaat': 'brasschaat',
  'Virga Jesse Hasselt': 'virga-jesse',
  'ZOL Heusden-Zolder': 'heusden-zolder',
  'AZ Maria Middelares (Gent)': 'az-maria-middelares-gent',
  'AZ Maria Middelares Gent': 'az-maria-middelares-gent',
  'Jessa Hasselt': 'jessa-hasselt',
  'AZ Geel': 'geel',
  'AZ Lier': 'lier',
  'AZ Maria Middelares Deinze': 'az-maria-middelares-deinze',
  'AZ Diest': 'diest',
};

// id -> coördinaten (België)
const coords = {
  'uz-brussel': { lat: 50.8824, lng: 4.2745 },
  'uz-leuven': { lat: 50.8814, lng: 4.671 },
  'uza': { lat: 51.1552, lng: 4.4452 },
  'deurne': { lat: 51.2192, lng: 4.4653 },
  'herentals': { lat: 51.1766, lng: 4.8325 },
  'mechelen': { lat: 51.0257, lng: 4.4776 },
  'gent': { lat: 51.0225, lng: 3.7108 },
  'genk': { lat: 50.9656, lng: 5.5001 },
  'az-turnhout': { lat: 51.3245, lng: 4.9486 },
  'mol': { lat: 51.1911, lng: 5.1166 },
  'brasschaat': { lat: 51.2912, lng: 4.4918 },
  'virga-jesse': { lat: 50.9307, lng: 5.3378 },
  'heusden-zolder': { lat: 51.0314, lng: 5.3134 },
  'az-maria-middelares-gent': { lat: 51.0265, lng: 3.6821 },
  'jessa-hasselt': { lat: 50.9307, lng: 5.3378 },
  'geel': { lat: 51.1614, lng: 4.9896 },
  'lier': { lat: 51.1313, lng: 4.5704 },
  'az-maria-middelares-deinze': { lat: 50.9871, lng: 3.5311 },
  'diest': { lat: 50.9894, lng: 5.0506 },
};

const locNames = new Map(); // id -> weergavenaam (eerste geziene Excel-naam)
rows.forEach((r) => {
  const from = r[0];
  const to = r[1];
  const fromId = nameToId[from];
  const toId = nameToId[to];
  if (fromId && !locNames.has(fromId)) locNames.set(fromId, from);
  if (toId && !locNames.has(toId)) locNames.set(toId, to);
});

const ziekenhuizen = [...locNames.entries()].map(([id, name]) => {
  const c = coords[id] || { lat: 50.85, lng: 4.35 };
  return { id, name, address: name, ...c };
});

const presets = rows.map((r, i) => {
  const fromName = r[0];
  const toName = r[1];
  const km = Math.round(Number(r[2]));
  const fromId = nameToId[fromName];
  const toId = nameToId[toName];
  if (!fromId || !toId) return null;
  return { id: 'preset-excel-' + (i + 1), fromId, toId, fromName, toName, defaultKm: km };
}).filter(Boolean);

console.log(JSON.stringify({ ziekenhuizen, presets }, null, 2));
