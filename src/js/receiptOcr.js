/**
 * Tankbon-OCR: herbruikbare Tesseract-worker + beperkte beeldresolutie voor snellere analyse (mobiel).
 */

const MAX_OCR_SIDE = 1280;

let workerPromise = null;
/** Seriële ketting: één recognize tegelijk per worker */
let ocrChain = Promise.resolve();

async function createReceiptWorker() {
  const { createWorker } = await import('tesseract.js');
  const w = await createWorker('nld', 1, {
    logger: () => {},
  });
  await w.setParameters({
    tessedit_pageseg_mode: '3',
    user_defined_dpi: '120',
  });
  return w;
}

async function getReceiptOcrWorker() {
  if (!workerPromise) {
    workerPromise = createReceiptWorker();
  }
  try {
    return await workerPromise;
  } catch (e) {
    workerPromise = null;
    throw e;
  }
}

async function resetReceiptOcrWorker() {
  const p = workerPromise;
  workerPromise = null;
  if (!p) return;
  try {
    const w = await p;
    await w.terminate();
  } catch {
    /* init of terminate mislukt */
  }
}

function downscaleCanvas(canvas, maxSide) {
  const mw = Math.max(canvas.width, canvas.height);
  if (mw <= maxSide) return canvas;
  const scale = maxSide / mw;
  const w = Math.round(canvas.width * scale);
  const h = Math.round(canvas.height * scale);
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'low';
  ctx.drawImage(canvas, 0, 0, w, h);
  return out;
}

function bitmapToCanvas(bmp, maxSide) {
  const mw = Math.max(bmp.width, bmp.height);
  const scale = Math.min(1, maxSide / mw);
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas niet beschikbaar');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'low';
  ctx.drawImage(bmp, 0, 0, w, h);
  return canvas;
}

/**
 * @param {File | HTMLCanvasElement} source
 * @returns {Promise<HTMLCanvasElement | File>}
 */
export async function downscaleForReceiptOcr(source) {
  if (source instanceof HTMLCanvasElement) {
    return downscaleCanvas(source, MAX_OCR_SIDE);
  }
  if (source instanceof File) {
    const bmp = await createImageBitmap(source);
    try {
      return bitmapToCanvas(bmp, MAX_OCR_SIDE);
    } finally {
      bmp.close();
    }
  }
  return source;
}

/**
 * OCR op tankbon (afbeelding of eerste-PDF-pagina als canvas). Worker wordt hergebruikt.
 * @param {File | HTMLCanvasElement} source
 * @returns {Promise<string>}
 */
export async function runReceiptOcr(source) {
  const run = async () => {
    const prepared = await downscaleForReceiptOcr(source);
    try {
      const worker = await getReceiptOcrWorker();
      const { data } = await worker.recognize(prepared);
      return data?.text || '';
    } catch (e) {
      await resetReceiptOcrWorker();
      throw e;
    }
  };

  const p = ocrChain.then(run);
  ocrChain = p.then(
    () => {},
    () => {}
  );
  return p;
}
