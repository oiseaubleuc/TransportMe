/**
 * OCR voor foto’s van transportbonnen (IHcT-codes + optioneel datum uit tekst).
 * Gebruikt tesseract.js (lokaal in de browser).
 */
import Tesseract from "tesseract.js";
import workerPath from "tesseract.js/dist/worker.min.js?url";
import corePath from "tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url";
import { extractBonCodesFromOcrText } from "./transportBon.js";
import { MAX_CANVAS_ZIJDE } from "./importGrenzen.js";

/** Datumfragmenten uit OCR-tekst (Belgische bonnen: vaak dd/mm/jjjj). */
function extractIsoDatesFromText(text) {
  const raw = String(text || "");
  const out = [];
  const seen = new Set();

  const push = (y, mo, da) => {
    if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || da < 1 || da > 31) return;
    const iso = `${y}-${String(mo).padStart(2, "0")}-${String(da).padStart(2, "0")}`;
    if (seen.has(iso)) return;
    seen.add(iso);
    out.push(iso);
  };

  for (const m of raw.matchAll(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/g)) {
    const da = Number(m[1]);
    const mo = Number(m[2]);
    const y = Number(m[3]);
    push(y, mo, da);
  }
  for (const m of raw.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    push(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  return out;
}

export { extractBonCodesFromOcrText };

function loadImageFromFile(file, signal) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    const klaar = () => {
      signal?.removeEventListener?.("abort", onAbort);
    };
    const onAbort = () => {
      URL.revokeObjectURL(url);
      img.onload = null;
      img.onerror = null;
      img.src = "";
      klaar();
      reject(new DOMException("Afgebroken", "AbortError"));
    };
    img.onload = () => {
      URL.revokeObjectURL(url);
      klaar();
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      klaar();
      reject(new Error("Afbeelding laden mislukt"));
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener?.("abort", onAbort);
    img.src = url;
  });
}

/** Verklein voor snellere OCR; behoud verhouding. */
export async function imageFileToDataUrlForOcr(file, maxSide = 1400, quality = 0.88, signal) {
  const img = await loadImageFromFile(file, signal);
  let { width, height } = img;
  const cap = Math.min(maxSide || MAX_CANVAS_ZIJDE, MAX_CANVAS_ZIJDE);
  const scale = Math.min(1, cap / Math.max(width, height, 1));
  width = Math.round(width * scale);
  height = Math.round(height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

let workerPromise = null;

export async function getBonOcrWorker(logger) {
  if (!workerPromise) {
    workerPromise = Tesseract.createWorker("nld+eng", 1, {
      logger: m => {
        if (typeof logger === "function") logger(m);
      },
      workerPath,
      corePath,
      langPath: "https://tessdata.projectnaptha.com/4.0.0",
      gzip: true,
    });
  }
  return workerPromise;
}

export async function terminateBonOcrWorker() {
  if (!workerPromise) return;
  try {
    const w = await workerPromise;
    await w.terminate();
  } catch {
    /* ignore */
  }
  workerPromise = null;
}

/**
 * @param {File} file
 * @param {{ logger?: (m: object) => void }} [opts]
 * @returns {Promise<{ text: string, codes: string[], dates: string[] }>}
 */
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("Bestand lezen mislukt"));
    r.readAsDataURL(file);
  });
}

let ocrRij = Promise.resolve();

export async function recognizeBonDataUrl(dataUrl, opts = {}) {
  if (!dataUrl) throw new Error("Kon afbeelding niet verwerken");
  if (opts.signal?.aborted) throw new DOMException("Afgebroken", "AbortError");
  const run = async () => {
    if (opts.signal?.aborted) throw new DOMException("Afgebroken", "AbortError");
    const worker = await getBonOcrWorker(opts.logger);
    const {
      data: { text },
    } = await worker.recognize(dataUrl);
    const codes = extractBonCodesFromOcrText(text);
    const dates = extractIsoDatesFromText(text);
    return { text: String(text || "").trim(), codes, dates };
  };
  const p = ocrRij.then(run, run);
  ocrRij = p.then(
    () => {},
    () => {}
  );
  return p;
}

export async function recognizeBonCanvas(canvas, opts = {}) {
  if (!canvas) throw new Error("Kon pagina niet verwerken");
  return recognizeBonDataUrl(canvas.toDataURL("image/jpeg", 0.92), opts);
}

export async function recognizeBonImage(file, opts = {}) {
  let dataUrl = null;
  if (file && file.size && file.size < 2_500_000) {
    try {
      const img = await loadImageFromFile(file, opts.signal);
      if (Math.max(img.width, img.height) <= 2400) dataUrl = await fileToDataUrl(file);
    } catch {
      dataUrl = null;
    }
  }
  if (!dataUrl) dataUrl = await imageFileToDataUrlForOcr(file, 2200, 0.95, opts.signal);
  return recognizeBonDataUrl(dataUrl, opts);
}

export { extractIsoDatesFromText };
