import { PRESET_ANCHOR_ZIEKENHUIZEN, DEFAULT_PRESET_ROUTES } from '../src/js/config.js';

const byId = Object.fromEntries(PRESET_ANCHOR_ZIEKENHUIZEN.map((h) => [h.id, h]));

async function osrmKm(fromId, toId) {
  const a = byId[fromId];
  const b = byId[toId];
  if (!a || !b) return null;
  const u = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`;
  const r = await fetch(u);
  const j = await r.json();
  const d = j.routes?.[0]?.distance;
  return d != null ? Math.round(d / 1000) : null;
}

for (const p of DEFAULT_PRESET_ROUTES) {
  const k = await osrmKm(p.fromId, p.toId);
  process.stdout.write(`${p.id}\t${k}\n`);
  await new Promise((r) => setTimeout(r, 350));
}
