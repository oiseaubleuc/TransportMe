/**
 * OCR voor foto’s van transportbonnen (IHcT-codes + optioneel datum uit tekst).
 * Gebruikt tesseract.js (lokaal in de browser).
 */
import Tesseract from "tesseract.js";

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

/**
 * IHcT-codes uit ruwe OCR (hoofdletters normaliseren waar zinvol).
 */
export function extractBonCodesFromOcrText(text) {
  const raw = String(text || "");
  const found = [];
  const seen = new Set();
  let m;
  const re = new RegExp(IHCT_RE.source, "gi");
  while ((m = re.exec(raw)) !== null) {
    const code = m[0].replace(/^IHCT/i, "IHcT");
    const key = code.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(code);
  }
  return found;
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Afbeelding laden mislukt"));
    };
    img.src = url;
  });
}

/** Verklein voor snellere OCR; behoud verhouding. */
export async function imageFileToDataUrlForOcr(file, maxSide = 1400, quality = 0.88) {
  const img = await loadImageFromFile(file);
  let { width, height } = img;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

let workerPromise = null;

export async function getBonOcrWorker(logger) {
  if (!workerPromise) {
    workerPromise = Tesseract.createWorker("nld+eng", 1, {
      logger: m => {
        if (typeof logger === "function") logger(m);
      },
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
export async function recognizeBonImage(file, opts = {}) {
  const dataUrl = await imageFileToDataUrlForOcr(file);
  if (!dataUrl) throw new Error("Kon afbeelding niet verwerken");
  const worker = await getBonOcrWorker(opts.logger);
  const {
    data: { text },
  } = await worker.recognize(dataUrl);
  const codes = extractBonCodesFromOcrText(text);
  const dates = extractIsoDatesFromText(text);
  return { text: String(text || "").trim(), codes, dates };
}

export { extractIsoDatesFromText };
