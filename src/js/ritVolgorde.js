/**
 * Oplopend volgordenummer per rit (eigen administratie).
 */

export function maxVolgordeNr(ritten) {
  let m = 0;
  for (const r of ritten) {
    const n = Number(r.volgordeNr);
    if (Number.isFinite(n) && n > m) m = n;
  }
  return m;
}

/** Eerste vrije nummer voor nieuwe ritten */
export function nextVolgordeStart(ritten) {
  return maxVolgordeNr(ritten) + 1;
}

/**
 * Kent ontbrekende volgordeNr toe (chronologisch op datum, tijd, id).
 * @returns {{ ritten: unknown[], changed: boolean }}
 */
export function backfillMissingVolgordeNrs(ritten) {
  const missing = ritten.filter(
    (r) => !Number.isFinite(Number(r.volgordeNr)) || Number(r.volgordeNr) < 1
  );
  if (missing.length === 0) return { ritten, changed: false };
  missing.sort((a, b) => {
    const c = (a.datum || '').localeCompare(b.datum || '');
    if (c !== 0) return c;
    const ct = String(a.tijd || '').localeCompare(String(b.tijd || ''));
    if (ct !== 0) return ct;
    return (Number(a.id) || 0) - (Number(b.id) || 0);
  });
  let next = maxVolgordeNr(ritten) + 1;
  const idToNr = new Map(missing.map((r) => [r.id, next++]));
  const updated = ritten.map((r) => (idToNr.has(r.id) ? { ...r, volgordeNr: idToNr.get(r.id) } : r));
  return { ritten: updated, changed: true };
}
