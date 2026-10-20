/**
 * Originele transportbonnen (foto of PDF) blijven op het toestel, los van de ritlijst.
 */

const DB_NAAM = "transportme";
const DB_VER = 1;
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

export async function zetBonBestand(rec) {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(rec);
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
  return rec;
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
    .map(x => ({
      id: x.id,
      pid: x.pid,
      naam: x.naam,
      type: x.type,
      bon: x.bon || "",
      d: x.d || "",
      tripId: x.tripId || "",
      toegevoegd: x.toegevoegd || "",
      bytes: x.blob && typeof x.blob.size === "number" ? x.blob.size : 0,
    }))
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
