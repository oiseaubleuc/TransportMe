/**
 * Lokale melding via de service worker zodra een rit lopend is.
 * Geen server: de melding blijft in het berichtencentrum staan.
 * "Geleverd" schrijft de service worker naar IndexedDB (zelfde database als public/sw.js).
 */

const GELEVERD_DB = "tm-geleverd";
const GELEVERD_STORE = "intents";

function openGeleverdDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(GELEVERD_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(GELEVERD_STORE)) {
        db.createObjectStore(GELEVERD_STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function leesGeleverdIntents() {
  if (!("indexedDB" in window)) return Promise.resolve([]);
  return openGeleverdDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(GELEVERD_STORE, "readonly");
        const req = tx.objectStore(GELEVERD_STORE).getAll();
        req.onsuccess = () => {
          db.close();
          resolve(Array.isArray(req.result) ? req.result : []);
        };
        req.onerror = () => {
          db.close();
          reject(req.error);
        };
      })
  );
}

export function verwijderGeleverdIntent(key) {
  if (!key || !("indexedDB" in window)) return Promise.resolve();
  return openGeleverdDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(GELEVERD_STORE, "readwrite");
        tx.objectStore(GELEVERD_STORE).delete(key);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      })
  );
}

export function meldingStatus() {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return "unsupported";
  return Notification.permission;
}

/** Alleen aanroepen vanuit een klik of tik. */
export function vraagMeldingToestemming() {
  if (!("Notification" in window)) return Promise.resolve("unsupported");
  if (Notification.permission !== "default") return Promise.resolve(Notification.permission);
  return Notification.requestPermission();
}

/**
 * Vraagt toestemming als die nog openstaat, en toont daarna een blijvende melding.
 * Direct aanroepen in de klikhandler, zodat iOS de toestemming aan de tik koppelt.
 */
export function meldRitLopend(rit, profileId) {
  if (!rit?.id || !profileId || !("Notification" in window) || !("serviceWorker" in navigator)) return;
  const toestemming =
    Notification.permission === "granted"
      ? Promise.resolve("granted")
      : Notification.permission === "denied"
        ? Promise.resolve("denied")
        : Notification.requestPermission();
  toestemming
    .then(async perm => {
      if (perm !== "granted") return;
      const reg = await navigator.serviceWorker.ready;
      const van = String(rit.f || "Vertrek");
      const naar = String(rit.t || "Aankomst");
      await reg.showNotification(`${van} → ${naar}`, {
        body: "Deze rit is lopend.",
        tag: `tm-rit-${profileId}-${rit.id}`,
        renotify: true,
        requireInteraction: true,
        lang: "nl",
        icon: "/apple-touch-icon.png",
        data: { tripId: String(rit.id), profileId: String(profileId) },
        actions: [{ action: "geleverd", title: "Geleverd" }],
      });
    })
    .catch(() => {});
}
