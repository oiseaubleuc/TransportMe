/**
 * Originele transportbonnen (foto of PDF) op het toestel.
 * Blobs worden AES-GCM-versleuteld met de open kluissleutel. Die sleutel staat niet in IndexedDB.
 */
import { DATA_RETENTION_DAYS } from "./config.js";
import { ontsleutelBytes, versleutelBytes } from "./kluisCrypto.js";
import { bewaarDagen, huidigeKluisSleutel, kluisOpen } from "./veiligeOpslag.js";

const DB_NAAM = "transportme";
const DB_VER = 2;
const STORE = "bonnen";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAAM, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: "id" });
        s.createIndex("pid", "pid", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Opslag afgebroken"));
  });
}

function metaVan(rec) {
  return {
    id: rec.id,
    pid: rec.pid,
    naam: rec.naam,
    type: rec.type,
    bon: rec.bon || "",
    d: rec.d || "",
    tripId: rec.tripId || "",
    toegevoegd: rec.toegevoegd || "",
    bytes:
      typeof rec.bytes === "number"
        ? rec.bytes
        : rec.blob && typeof rec.blob.size === "number"
          ? rec.blob.size
          : 0,
    versleuteld: !!(rec.iv && rec.ct),
  };
}

async function versleutelRec(rec, key) {
  if (!rec?.blob || !key) return rec;
  const buf = new Uint8Array(await rec.blob.arrayBuffer());
  const { iv, ct } = await versleutelBytes(key, buf);
  const { blob, ...rest } = rec;
  return { ...rest, iv, ct, bytes: buf.length };
}

async function ontsleutelRec(rec, key) {
  if (!rec) return null;
  if (rec.blob) return rec;
  if (!rec.iv || !rec.ct) return rec;
  if (!key) throw new Error("Kluis is dicht");
  const pt = await ontsleutelBytes(key, rec.iv, rec.ct);
  return { ...rec, blob: new Blob([pt], { type: rec.type || "application/octet-stream" }) };
}

async function migreerRec(rec, key) {
  if (!rec?.blob || !key) return rec;
  const next = await versleutelRec(rec, key);
  const check = await ontsleutelRec(next, key);
  if (!check?.blob || check.blob.size !== rec.blob.size) throw new Error("Bonmigratie mismatch");
  return next;
}

export async function zetBonBestand(rec) {
  const key = huidigeKluisSleutel();
  if (!key) throw new Error("Kluis is dicht");
  const opgeslagen = await versleutelRec(rec, key);
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(opgeslagen);
  await txDone(tx);
  db.close();
}

export async function haalBonBestand(id) {
  if (!id) return null;
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const rec = await new Promise((resolve, reject) => {
    const r = tx.objectStore(STORE).get(id);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => reject(r.error);
  });
  db.close();
  if (!rec) return null;
  return ontsleutelRec(rec, huidigeKluisSleutel());
}

export async function lijstBonBestanden(pid) {
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const alle = await new Promise((resolve, reject) => {
    const r = tx.objectStore(STORE).getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
  db.close();
  const gefilterd = pid ? alle.filter(x => x.pid === pid) : alle;
  return gefilterd
    .map(metaVan)
    .sort((a, b) => String(b.d || b.toegevoegd).localeCompare(String(a.d || a.toegevoegd)));
}

export async function verwijderBonBestand(id) {
  if (!id) return;
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete(id);
  await txDone(tx);
  db.close();
}

function recDatumMs(rec) {
  const iso = String(rec.d || rec.toegevoegd || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const t = Date.parse(rec.toegevoegd || "");
    return Number.isFinite(t) ? t : Date.now();
  }
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

export function bewaarCutoffMs(dagen = bewaarDagen()) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - Math.max(1, Number(dagen) || DATA_RETENTION_DAYS));
  return d.getTime();
}

/** Verwijder originele bestanden ouder dan de bewaartermijn. */
export async function ruimVerlopenBonnenOp(dagen = bewaarDagen()) {
  const cutoff = bewaarCutoffMs(dagen);
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  const alle = await new Promise((resolve, reject) => {
    const r = store.getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
  let verwijderd = 0;
  for (const rec of alle) {
    if (recDatumMs(rec) < cutoff) {
      store.delete(rec.id);
      verwijderd++;
    }
  }
  await txDone(tx);
  db.close();
  return verwijderd;
}

/** Versleutel bestaande plaintext-blobs; laat ze intact bij fout. */
export async function migreerBonArchief() {
  if (!kluisOpen()) return { versleuteld: 0, fout: 0 };
  const key = huidigeKluisSleutel();
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const alle = await new Promise((resolve, reject) => {
    const r = tx.objectStore(STORE).getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
  db.close();
  let versleuteld = 0;
  let fout = 0;
  for (const rec of alle) {
    if (!rec?.blob || (rec.iv && rec.ct)) continue;
    try {
      const next = await migreerRec(rec, key);
      const dbw = await openDb();
      const txw = dbw.transaction(STORE, "readwrite");
      txw.objectStore(STORE).put(next);
      await txDone(txw);
      dbw.close();
      versleuteld++;
    } catch (e) {
      console.error("Bonmigratie mislukt", rec.id, e);
      fout++;
    }
  }
  return { versleuteld, fout };
}

export function openBonBlob(rec) {
  if (!rec?.blob) return;
  const url = URL.createObjectURL(rec.blob);
  const w = window.open(url, "_blank", "noopener");
  if (!w) {
    const a = document.createElement("a");
    a.href = url;
    a.download = rec.naam || "transportbon";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
