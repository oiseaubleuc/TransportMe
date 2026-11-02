/**
 * PDF naar canvas / tekst (voor transportbonnen en OCR).
 * Alleen dynamisch importeren wanneer de gebruiker een PDF kiest.
 */
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { MAX_CANVAS_ZIJDE, MAX_PDF_PAGINAS } from "./importGrenzen.js";

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

function ruimCanvasOp(canvas) {
  if (!canvas) return;
  try {
    canvas.width = 0;
    canvas.height = 0;
  } catch {
    /* */
  }
}

async function renderPagina(page, scale) {
  let viewport = page.getViewport({ scale });
  const lang = Math.max(viewport.width, viewport.height);
  if (lang > MAX_CANVAS_ZIJDE) {
    scale = scale * (MAX_CANVAS_ZIJDE / lang);
    viewport = page.getViewport({ scale });
  }
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: false });
  if (!ctx) throw new Error("Canvas niet beschikbaar");
  canvas.width = Math.min(MAX_CANVAS_ZIJDE, Math.ceil(viewport.width));
  canvas.height = Math.min(MAX_CANVAS_ZIJDE, Math.ceil(viewport.height));
  const task = page.render({ canvasContext: ctx, viewport });
  try {
    await task.promise;
    return canvas;
  } catch (e) {
    ruimCanvasOp(canvas);
    throw e;
  }
}

/**
 * @param {File} file
 * @param {number} [scale]
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function pdfFileToCanvas(file, scale = 2) {
  const uit = await pdfFileToPaginas(file, { scale, maxPages: 1, metCanvas: true });
  try {
    if (!uit.pages[0]?.canvas) throw new Error("PDF heeft geen pagina’s");
    const canvas = uit.pages[0].canvas;
    await uit.destroyPdf?.();
    return canvas;
  } catch (e) {
    await uit.cleanup?.();
    throw e;
  }
}

/**
 * @param {File|Blob} file
 * @param {{ scale?: number, maxPages?: number, metCanvas?: boolean | ((text: string) => boolean), signal?: AbortSignal }} [opts]
 * @returns {Promise<{ pages: Array<{ nr: number, text: string, canvas?: HTMLCanvasElement }>, overgeslagenPaginas: number, cleanup: () => void }>}
 */
export async function pdfFileToPaginas(file, opts = {}) {
  const scale = opts.scale ?? 2;
  const maxPages = Math.min(opts.maxPages ?? MAX_PDF_PAGINAS, MAX_PDF_PAGINAS);
  const signal = opts.signal;
  if (signal?.aborted) throw new DOMException("Afgebroken", "AbortError");
  const data = await file.arrayBuffer();
  if (signal?.aborted) throw new DOMException("Afgebroken", "AbortError");
  const loading = pdfjsLib.getDocument({ data, disableAutoFetch: true, disableStream: true });
  let pdf;
  const canvassen = [];
  const destroyPdf = async () => {
    try {
      await pdf?.destroy?.();
    } catch {
      /* */
    }
    pdf = null;
  };
  const cleanup = async () => {
    for (const c of canvassen) ruimCanvasOp(c);
    canvassen.length = 0;
    await destroyPdf();
  };
  try {
    pdf = await loading.promise;
    if (pdf.numPages < 1) throw new Error("PDF heeft geen pagina’s");
    const n = Math.min(pdf.numPages, maxPages);
    const overgeslagenPaginas = Math.max(0, pdf.numPages - n);
    const pages = [];
    for (let i = 1; i <= n; i++) {
      if (signal?.aborted) throw new DOMException("Afgebroken", "AbortError");
      const page = await pdf.getPage(i);
      try {
        const text = tekstVanContent(await page.getTextContent());
        const row = { nr: i, text };
        const wilCanvas =
          opts.metCanvas === true || (typeof opts.metCanvas === "function" && opts.metCanvas(text));
        if (wilCanvas) {
          row.canvas = await renderPagina(page, scale);
          canvassen.push(row.canvas);
        }
        pages.push(row);
      } finally {
        try {
          page.cleanup();
        } catch {
          /* */
        }
      }
    }
    return { pages, overgeslagenPaginas, cleanup, destroyPdf };
  } catch (e) {
    await cleanup();
    throw e;
  }
}
