/**
 * Foto of PDF van een transportbon → tekststukken (één per IHcT-bon).
 * Digitale PDF: tekst uit het bestand. Scan/foto: herkenning van de pagina.
 */
import { recognizeBonImage, recognizeBonCanvas } from "./bonFotoOcr.js";
import { splitBonStukken } from "./transportBon.js";

export function isPdfBestand(file) {
  const type = String(file?.type || "").toLowerCase();
  const naam = String(file?.name || "");
  return type === "application/pdf" || type === "application/x-pdf" || /\.pdf$/i.test(naam);
}

export function isBonBestand(file) {
  if (!file) return false;
  if (isPdfBestand(file)) return true;
  const type = String(file.type || "").toLowerCase();
  if (type.startsWith("image/")) return true;
  return /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(file.name || "");
}

export function paginaTekstDun(text) {
  const t = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length < 48) return true;
  return t.length < 180 && !/\b(ihct|pickup|drop\s*off|omschrijving|\borg\.?\b)/i.test(t);
}

function voegTekstToe(delen, text) {
  const t = String(text || "").trim();
  if (t) delen.push(t);
}

/**
 * @param {File} file
 * @param {{ logger?: (m: object) => void, onVoortgang?: (p: number) => void }} [opts]
 * @returns {Promise<Array<{ text: string, bron: "pdf"|"ocr"|"foto" }>>}
 */
export async function leesBonBestand(file, opts = {}) {
  if (isPdfBestand(file)) {
    const { pdfFileToPaginas } = await import("./pdfFirstPageToCanvas.js");
    const pages = await pdfFileToPaginas(file, {
      scale: 2.1,
      maxPages: 20,
      metCanvas: paginaTekstDun,
    });
    const delen = [];
    let bron = "pdf";
    for (let i = 0; i < pages.length; i++) {
      if (typeof opts.onVoortgang === "function") opts.onVoortgang((i + 0.2) / pages.length);
      let text = pages[i].text || "";
      if (paginaTekstDun(text) && pages[i].canvas) {
        const ocr = await recognizeBonCanvas(pages[i].canvas, { logger: opts.logger });
        const ocrText = ocr?.text || "";
        if (ocrText.length > text.length) {
          text = ocrText;
          bron = "ocr";
        } else if (ocrText) {
          text = [text, ocrText].filter(Boolean).join("\n");
          bron = "ocr";
        }
      }
      voegTekstToe(delen, text);
      if (typeof opts.onVoortgang === "function") opts.onVoortgang((i + 1) / pages.length);
    }
    const stukken = splitBonStukken(delen.join("\n\n"));
    return (stukken.length ? stukken : [""]).map(text => ({ text, bron }));
  }

  if (typeof opts.onVoortgang === "function") opts.onVoortgang(0.2);
  const { text } = await recognizeBonImage(file, { logger: opts.logger });
  if (typeof opts.onVoortgang === "function") opts.onVoortgang(1);
  const stukken = splitBonStukken(text || "");
  return (stukken.length ? stukken : [text || ""]).map(t => ({ text: t, bron: "foto" }));
}
