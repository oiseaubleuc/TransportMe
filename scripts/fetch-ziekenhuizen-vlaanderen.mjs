/**
 * Haalt alle OSM amenity=hospital binnen Vlaams Gewest (BE-VLG) op
 * en schrijft src/data/ziekenhuizen-vlaanderen.json
 *
 * Gebruik: node scripts/fetch-ziekenhuizen-vlaanderen.mjs
 * Vereist: netwerk (Overpass API)
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '../src/data/ziekenhuizen-vlaanderen.json');

const QUERY = `[out:json][timeout:180];
area["ISO3166-2"="BE-VLG"]->.vl;
(
  node["amenity"="hospital"](area.vl);
  way["amenity"="hospital"](area.vl);
);
out center tags;`;

function slug(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

async function main() {
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: `data=${encodeURIComponent(QUERY)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  const data = await res.json();
  const seen = new Map();
  const list = [];

  for (const el of data.elements || []) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    const tags = el.tags || {};
    const name =
      tags['name:nl'] || tags.name || tags['official_name'] || tags['short_name'];
    if (!name || lat == null || lon == null) continue;

    const city = tags['addr:city'] || tags['addr:municipality'] || '';
    const street = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ');
    const address = [street, city, tags['addr:postcode']].filter(Boolean).join(', ') || name;

    const baseId = `osm-${el.type}-${el.id}`;
    let id = slug(name);
    if (seen.has(id)) id = `${id}-${el.id}`;
    seen.set(id, true);

    list.push({
      id,
      name: String(name).trim(),
      address: address.trim(),
      lat: Number(lat),
      lng: Number(lon),
      _osm: baseId,
    });
  }

  list.sort((a, b) => a.name.localeCompare(b.name, 'nl-BE'));

  mkdirSync(dirname(OUT), { recursive: true });
  const exportList = list.map(({ _osm, ...rest }) => rest);
  writeFileSync(OUT, JSON.stringify(exportList, null, 0), 'utf8');
  console.log(`Geschreven: ${OUT} (${exportList.length} ziekenhuizen / locaties)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
