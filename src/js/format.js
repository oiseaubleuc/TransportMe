/**
 * Formattering – bedragen en getallen (Belgische conventies: nl-BE)
 */

export function formatEuro(n) {
  return '€ ' + Number(n).toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Liter in Belgisch formaat (komma als decimaalteken, eenheid L) */
export function formatLiter(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return '— L';
  return num.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' L';
}

/** Datum (YYYY-MM-DD) + optioneel tijd (HH:mm) → "ma 15 mrt 2025, 14:30" */
export function formatDatumTijd(datumStr, tijdStr) {
  if (!datumStr || datumStr.length < 10) return '—';
  const [y, m, d] = datumStr.slice(0, 10).split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const datum = date.toLocaleDateString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  if (tijdStr && /^\d{1,2}:\d{2}$/.test(String(tijdStr).trim())) return `${datum}, ${tijdStr.trim()}`;
  return datum;
}
