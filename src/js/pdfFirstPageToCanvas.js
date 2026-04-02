/**
 * Eerste pagina van een PDF naar canvas (voor OCR met Tesseract).
 * Alleen dynamisch importeren wanneer de gebruiker een PDF kiest.
 */
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/**
 * @param {File} file
 * @param {number} [scale]
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function pdfFileToCanvas(file, scale = 2) {
  const data = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;
  if (pdf.numPages < 1) throw new Error('PDF heeft geen pagina’s');
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas niet beschikbaar');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}
