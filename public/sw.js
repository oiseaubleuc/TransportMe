/**
 * TransportMe PWA — voorkomt wit scherm na deploy:
 * index + Vite /assets/* worden netwerk-eerst geladen (hashed bestandsnamen wijzigen per build).
 */
const CACHE_NAME = "transportme-v3";
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
