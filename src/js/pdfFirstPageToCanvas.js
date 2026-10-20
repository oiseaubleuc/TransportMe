/**
 * PDF naar canvas / tekst (voor transportbonnen en OCR).
 * Alleen dynamisch importeren wanneer de gebruiker een PDF kiest.
 */
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function tekstVanContent(content) {
  let lastY = null;
  const lines = [];
  let line = "";
  for (const it of content.items || []) {
    const s = String(it.str || "");
    if (!s) continue;
    const y = it.transform ? it.transform[5] : 0;
    if (lastY != null && Math.abs(y - lastY) > 3.5) {
      if (line.trim()) lines.push(line.trim());
      line = s;
    } else {
      line += (line && !/\s$/.test(line) && !/^\s/.test(s) ? " " : "") + s;
    }
    lastY = y;
  }
  if (line.trim()) lines.push(line.trim());
  return lines.join("\n");
}

async function renderPagina(page, scale) {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas niet beschikbaar");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

/**
 * @param {File} file
 * @param {number} [scale]
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function pdfFileToCanvas(file, scale = 2) {
  const pages = await pdfFileToPaginas(file, { scale, maxPages: 1, metCanvas: true });
  if (!pages[0]?.canvas) throw new Error("PDF heeft geen pagina’s");
  return pages[0].canvas;
}

/**
 * @param {File|Blob} file
 * @param {{ scale?: number, maxPages?: number, metCanvas?: boolean | ((text: string) => boolean) }} [opts]
 * @returns {Promise<Array<{ nr: number, text: string, canvas?: HTMLCanvasElement }>>}
 */
export async function pdfFileToPaginas(file, opts = {}) {
  const scale = opts.scale ?? 2;
  const maxPages = opts.maxPages ?? 20;
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  if (pdf.numPages < 1) throw new Error("PDF heeft geen pagina’s");
  const n = Math.min(pdf.numPages, maxPages);
  const pages = [];
  for (let i = 1; i <= n; i++) {
    const page = await pdf.getPage(i);
    const text = tekstVanContent(await page.getTextContent());
    const row = { nr: i, text };
    const wilCanvas =
      opts.metCanvas === true || (typeof opts.metCanvas === "function" && opts.metCanvas(text));
    if (wilCanvas) row.canvas = await renderPagina(page, scale);
    pages.push(row);
  }
  return pages;
}
