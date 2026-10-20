/**
 * PDF naar canvas / tekst (voor transportbonnen en OCR).
 * Alleen dynamisch importeren wanneer de gebruiker een PDF kiest.
 */
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/**
 * IHcT-PDF’s zetten labels en waarden niet in leesvolgorde in het bestand.
 * Eerst boven→onder, dan links→rechts, anders raken Pickup/Dropoff door elkaar.
 */
export function tekstVanContent(content) {
  const rows = [];
  for (const it of content.items || []) {
    const s = String(it.str || "");
    if (!s) continue;
    const x = it.transform ? Number(it.transform[4]) || 0 : 0;
    const y = it.transform ? Number(it.transform[5]) || 0 : 0;
    rows.push({ s, x, y });
  }
  rows.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  let parts = [];
  let lastY = null;
  const flush = () => {
    if (!parts.length) return;
    parts.sort((a, b) => a.x - b.x);
    const line = parts
      .map(p => p.s)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (line) lines.push(line);
    parts = [];
  };
  for (const r of rows) {
    if (lastY != null && Math.abs(r.y - lastY) > 3.5) flush();
    parts.push(r);
    lastY = r.y;
  }
  flush();
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
