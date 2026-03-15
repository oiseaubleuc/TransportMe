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
