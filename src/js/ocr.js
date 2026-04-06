/**
 * OCR-parsing van tankbontekst: datum, liter, totaalprijs
 * Verwacht Nederlandse/Belgische formaten (dd/mm/yyyy, komma als decimaal).
 */

/**
 * Zoekt een datum in de tekst (dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy of yyyy-mm-dd).
 * Geeft terug als YYYY-MM-DD of null.
 */
export function parseDatum(text) {
  if (!text || typeof text !== 'string') return null;
  const t = text.replace(/\s+/g, ' ');

  // yyyy-mm-dd
  const iso = t.match(/\b(20\d{2})[-./](\d{1,2})[-./](\d{1,2})\b/);
  if (iso) {
    const y = parseInt(iso[1], 10);
    const m = parseInt(iso[2], 10);
    const d = parseInt(iso[3], 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  // dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy
  const dmy = t.match(/\b(\d{1,2})[-./](\d{1,2})[-./](20\d{2})\b/);
  if (dmy) {
    const d = parseInt(dmy[1], 10);
    const m = parseInt(dmy[2], 10);
    const y = parseInt(dmy[3], 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  return null;
}

/**
 * Zoekt een getal dat liters kan zijn (vaak gevolgd door L of "liter", of decimaal met komma).
 */
function parseLiter(text) {
  if (!text || typeof text !== 'string') return null;
  const t = text.replace(/,/g, '.');

  // Getal gevolgd door L of "liter" of "l"
  const metL = t.match(/(\d{1,3}(?:\.\d+)?)\s*[Ll](?:iter)?/i);
  if (metL) {
    const v = parseFloat(metL[1]);
    if (Number.isFinite(v) && v > 0 && v < 1000) return v;
  }

  // Getallen met decimaal (komma in origineel): 42,5 of 42.5
  const decimals = t.match(/\b(\d{1,3})[.,](\d{1,2})\b/g);
  if (decimals) {
    for (const s of decimals) {
      const v = parseFloat(s.replace(',', '.'));
      if (Number.isFinite(v) && v >= 1 && v <= 500) return v; // typisch 1–500 L
    }
  }

  return null;
}

/**
 * Zoekt totaalbedrag: EUR, €, "totaal", "te betalen", "euro", gevolgd door/getal met komma.
 */
function parsePrijs(text) {
  if (!text || typeof text !== 'string') return null;
  const t = text.replace(/\s+/g, ' ');

  // € 85,00 of 85,00 EUR of totaal 85.00
  const withSymbol = t.match(/(?:€|EUR|euro|totaal|te betalen)\s*[\s:]*(\d{1,3}[.,]\d{2})/gi);
  if (withSymbol && withSymbol.length) {
    const last = withSymbol[withSymbol.length - 1];
    const m = last.match(/(\d{1,3}[.,]\d{2})/);
    if (m) {
      const v = parseFloat(m[1].replace(',', '.'));
      if (Number.isFinite(v) && v > 0) return v;
    }
  }

  // Getal met twee decimalen dat op een bedrag lijkt (bijv. 85,00 of 85.00)
  const bedragen = t.match(/\b(\d{2,3})[.,](\d{2})\b/g);
  if (bedragen) {
    const values = bedragen.map((s) => parseFloat(s.replace(',', '.'))).filter((n) => n > 5 && n < 5000);
    if (values.length) return Math.max(...values);
  }

  return null;
}

/**
 * Analyseert OCR-tekst van een tankbon.
 * @returns {{ datum: string | null, liter: number | null, prijs: number | null, rawText: string }}
 */
export function parseReceiptText(text) {
  const raw = typeof text === 'string' ? text : '';
  return {
    datum: parseDatum(raw),
    liter: parseLiter(raw),
    prijs: parsePrijs(raw),
    rawText: raw.slice(0, 500),
  };
}
