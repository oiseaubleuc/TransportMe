/**
 * Limieten en inhoudscontrole voor transportbon-import.
 * Vertrouw niet op extensie of aangeleverd MIME-type.
 */

export const MAX_BESTANDEN = 80;
export const MAX_BESTAND_BYTES = 14 * 1024 * 1024;
export const MAX_BATCH_BYTES = 80 * 1024 * 1024;
export const MAX_PDF_PAGINAS = 20;
export const MAX_CANVAS_ZIJDE = 4096;
export const IMPORT_CONCURRENTIE = 2;
export const BESTAND_TIMEOUT_MS = 90_000;

export function magieSoort(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (b.length < 4) return null;
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "pdf";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "gif";
  if (b[0] === 0x42 && b[1] === 0x4d) return "bmp";
  if (
    b.length >= 12 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

export function isPdfSoort(soort) {
  return soort === "pdf";
}

export function isBeeldSoort(soort) {
  return soort === "jpeg" || soort === "png" || soort === "gif" || soort === "webp" || soort === "bmp";
}

export function keurBonBestand(file, bytes) {
  if (!file) return { ok: false, reden: "Geen bestand." };
  if (file.size > MAX_BESTAND_BYTES) {
    return { ok: false, reden: `Groter dan ${MAX_BESTAND_BYTES / (1024 * 1024)} MB.` };
  }
  const soort = magieSoort(bytes);
  if (!soort) {
    return {
      ok: false,
      reden: "Geen ondersteunde foto of PDF (inhoud komt niet overeen met het bestandstype).",
    };
  }
  return { ok: true, soort };
}

export function keurBatch(files) {
  const arr = Array.from(files || []);
  if (!arr.length) return { ok: [], geweigerd: [{ reden: "Kies een foto of PDF." }] };
  const geweigerd = [];
  const ok = [];
  let totaal = 0;
  for (const f of arr) {
    if (ok.length >= MAX_BESTANDEN) {
      geweigerd.push({ naam: f.name, reden: `Meer dan ${MAX_BESTANDEN} bestanden.` });
      continue;
    }
    if (f.size > MAX_BESTAND_BYTES) {
      geweigerd.push({ naam: f.name, reden: `Groter dan ${MAX_BESTAND_BYTES / (1024 * 1024)} MB.` });
      continue;
    }
    if (totaal + f.size > MAX_BATCH_BYTES) {
      geweigerd.push({ naam: f.name, reden: "De hele selectie is te groot." });
      continue;
    }
    totaal += f.size;
    ok.push(f);
  }
  return { ok, geweigerd, totaal };
}

export async function leesKop(file, n = 16) {
  const buf = await file.slice(0, n).arrayBuffer();
  return new Uint8Array(buf);
}

export async function mapMetLimiet(items, limiet, fn, { signal } = {}) {
  const list = Array.from(items || []);
  const out = new Array(list.length);
  let i = 0;
  async function worker() {
    while (i < list.length) {
      if (signal?.aborted) throw new DOMException("Afgebroken", "AbortError");
      const idx = i++;
      out[idx] = await fn(list[idx], idx, signal);
    }
  }
  const n = Math.min(Math.max(1, limiet), list.length || 1);
  await Promise.all(Array.from({ length: list.length ? n : 0 }, () => worker()));
  return out;
}

export function metTimeout(promise, ms, signal, fout = "Het lezen duurde te lang.") {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal?.addEventListener?.("abort", onAbort);
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      ctrl.abort();
      reject(new Error(fout));
    }, ms);
    promise.then(
      v => {
        clearTimeout(t);
        signal?.removeEventListener?.("abort", onAbort);
        resolve(v);
      },
      e => {
        clearTimeout(t);
        signal?.removeEventListener?.("abort", onAbort);
        reject(e);
      }
    );
  });
}

export function geweigerdTekst(geweigerd) {
  if (!geweigerd?.length) return "";
  if (geweigerd.length === 1) {
    const g = geweigerd[0];
    return g.naam ? `${g.naam}: ${g.reden}` : g.reden;
  }
  return `${geweigerd.length} bestanden geweigerd. ${geweigerd
    .slice(0, 3)
    .map(g => (g.naam ? `${g.naam}: ${g.reden}` : g.reden))
    .join(" ")}`;
}
