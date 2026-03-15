/**
 * Formattering – bedragen en getallen
 */

export function formatEuro(n) {
  return '€ ' + Number(n).toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
