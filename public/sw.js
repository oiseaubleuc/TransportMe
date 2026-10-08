/**
 * TransportMe PWA — voorkomt wit scherm na deploy:
 * index + Vite /assets/* worden netwerk-eerst geladen (hashed bestandsnamen wijzigen per build).
 */
const CACHE_NAME = "transportme-v4";
const GELEVERD_DB = "tm-geleverd";
const GELEVERD_STORE = "intents";
const IS_LOCAL = self.location.hostname === "localhost" || self.location.hostname === "127.0.0.1";
const PRECACHE_URLS = ["/manifest.webmanifest", "/favicon.svg", "/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function maybeCache(cache, request, response) {
  if (!response || response.status !== 200 || response.type !== "basic") {
    return Promise.resolve(response);
  }
  return cache.put(request, response.clone()).then(() => response);
}

self.addEventListener("fetch", (event) => {
  if (IS_LOCAL) return;
  const { request } = event;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;
  const isNavigate = request.mode === "navigate";
  const isHtmlShell = path === "/" || path === "/index.html";
  const isViteAsset = path.startsWith("/assets/") || path.endsWith(".js") || path.endsWith(".css");

  if (isNavigate || isHtmlShell || isViteAsset) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        fetch(request)
          .then((res) => maybeCache(cache, request, res))
          .catch(() => cache.match(request))
          .then((res) => {
            if (res) return res;
            if (isNavigate || isHtmlShell) return cache.match("/index.html");
            return new Response("", { status: 504, statusText: "Offline" });
          })
      )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return caches.open(CACHE_NAME).then((cache) =>
        fetch(request).then((res) => maybeCache(cache, request, res))
      );
    })
  );
});

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

function geldigId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
}

function bewaarGeleverd(profileId, tripId) {
  const key = profileId + ":" + tripId;
  return openGeleverdDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(GELEVERD_STORE, "readwrite");
        tx.objectStore(GELEVERD_STORE).put({
          key,
          profileId,
          tripId,
          at: Date.now(),
        });
        tx.oncomplete = () => {
          db.close();
          resolve(key);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      })
  );
}

async function verwerkGeleverdActie(data) {
  const profileId = data && data.profileId;
  const tripId = data && data.tripId;
  if (!geldigId(profileId) || !geldigId(tripId)) return;
  const key = await bewaarGeleverd(profileId, tripId);
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage({ type: "tm-geleverd", profileId, tripId, key });
  }
}

async function openOfFocusApp() {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clients) {
    if ("focus" in client) return client.focus();
  }
  if (self.clients.openWindow) return self.clients.openWindow("/");
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "geleverd") {
    event.waitUntil(verwerkGeleverdActie(event.notification.data));
    return;
  }
  event.waitUntil(openOfFocusApp());
});
