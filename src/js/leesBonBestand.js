/**
 * Foto of PDF van een transportbon → tekststukken (één per IHcT-bon).
 * Digitale PDF: tekst uit het bestand. Scan/foto: herkenning van de pagina.
 */
import { recognizeBonImage, recognizeBonCanvas } from "./bonFotoOcr.js";
import { splitBonStukken } from "./transportBon.js";
import { isBeeldSoort, isPdfSoort, keurBonBestand, leesKop, MAX_PDF_PAGINAS } from "./importGrenzen.js";

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

function ruimCanvasOp(canvas) {
  if (!canvas) return;
  try {
    canvas.width = 0;
    canvas.height = 0;
  } catch {
    /* */
  }
}

/**
 * @param {File} file
 * @param {{ logger?: (m: object) => void, onVoortgang?: (p: number) => void, signal?: AbortSignal }} [opts]
 * @returns {Promise<Array<{ text: string, bron: "pdf"|"ocr"|"foto", waarschuwing?: string }>>}
 */
export async function leesBonBestand(file, opts = {}) {
  const signal = opts.signal;
  if (signal?.aborted) throw new DOMException("Afgebroken", "AbortError");
  const kop = await leesKop(file, 16);
  const keur = keurBonBestand(file, kop);
  if (!keur.ok) {
    const err = new Error(keur.reden);
    err.code = "GEWEIGERD";
    throw err;
  }

  if (isPdfSoort(keur.soort)) {
    const { pdfFileToPaginas } = await import("./pdfFirstPageToCanvas.js");
    let uit;
    try {
      uit = await pdfFileToPaginas(file, {
        scale: 2.1,
        maxPages: MAX_PDF_PAGINAS,
        metCanvas: paginaTekstDun,
        signal,
      });
      const { pages, overgeslagenPaginas } = uit;
      const delen = [];
      let bron = "pdf";
      const waarschuwingen = [];
      if (overgeslagenPaginas) {
        waarschuwingen.push(
          `${overgeslagenPaginas === 1 ? "1 pagina" : overgeslagenPaginas + " pagina’s"} overgeslagen (limiet ${MAX_PDF_PAGINAS}).`
        );
      }
      for (let i = 0; i < pages.length; i++) {
        if (signal?.aborted) throw new DOMException("Afgebroken", "AbortError");
        if (typeof opts.onVoortgang === "function") opts.onVoortgang((i + 0.2) / pages.length);
        let text = pages[i].text || "";
        if (paginaTekstDun(text) && pages[i].canvas) {
          try {
            const ocr = await recognizeBonCanvas(pages[i].canvas, { logger: opts.logger, signal });
            const ocrText = ocr?.text || "";
            if (ocrText.length > text.length) {
              text = ocrText;
              bron = "ocr";
            } else if (ocrText) {
              text = [text, ocrText].filter(Boolean).join("\n");
              bron = "ocr";
            }
          } catch (e) {
            if (e?.name === "AbortError") throw e;
            waarschuwingen.push(`Pagina ${pages[i].nr} kon niet worden herkend.`);
          }
        }
        voegTekstToe(delen, text);
        ruimCanvasOp(pages[i].canvas);
        if (typeof opts.onVoortgang === "function") opts.onVoortgang((i + 1) / pages.length);
      }
      const stukken = splitBonStukken(delen.join("\n\n"));
      const warn = waarschuwingen.join(" ");
      const rows = (stukken.length ? stukken : [""]).map(text => ({ text, bron, waarschuwing: warn }));
      return rows;
    } finally {
      try {
        await uit?.cleanup?.();
      } catch {
        /* */
      }
    }
  }

  if (!isBeeldSoort(keur.soort)) {
    const err = new Error("Dit bestandstype wordt niet ondersteund.");
    err.code = "GEWEIGERD";
    throw err;
  }

  if (typeof opts.onVoortgang === "function") opts.onVoortgang(0.2);
  const { text } = await recognizeBonImage(file, { logger: opts.logger, signal });
  if (typeof opts.onVoortgang === "function") opts.onVoortgang(1);
  const stukken = splitBonStukken(text || "");
  return (stukken.length ? stukken : [text || ""]).map(t => ({ text: t, bron: "foto" }));
}
