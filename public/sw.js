/**
 * Service Worker para la PWA MyKimai.
 *
 * Solo cachea activos estáticos GET de mismo origen y ofrece página offline para
 * navegación. **NUNCA intercepta requests no-GET** (POST de Server Actions,
 * mutaciones, etc.): pasan directo a la red. Antes el SW re-fetcheaba TODO y en el
 * catch devolvía caches.match() (undefined para POST no cacheados) →
 * "Failed to convert value to 'Response'" / "Failed to fetch" en cada Server Action.
 */
const CACHE_NAME = "mykimai-pwa-v2";
const OFFLINE_URL = "/offline";

const STATIC_ASSETS = [
  "/offline",
  "/favicon.svg",
  "/icon-192x192.png",
  "/icon-512x512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // 1) Solo GET. Todo lo demás (Server Actions POST, mutaciones) pasa directo a la
  //    red sin que el SW lo toque (no event.respondWith → comportamiento nativo).
  if (req.method !== "GET") return;

  // 2) Solo mismo origen (no interceptar Supabase/AFIP/terceros).
  let sameOrigin = false;
  try {
    sameOrigin = new URL(req.url).origin === self.location.origin;
  } catch {
    sameOrigin = false;
  }
  if (!sameOrigin) return;

  // 3) Navegación: network-first con fallback a cache / /offline. Siempre Response válida.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
          }
          return res;
        })
        .catch(async () => {
          return (
            (await caches.match(req)) ||
            (await caches.match(OFFLINE_URL)) ||
            new Response("Sin conexión", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            })
          );
        })
    );
    return;
  }

  // 4) Activos estáticos GET: network-first con fallback a cache. Nunca undefined.
  if (isStaticAsset(req.url)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
          }
          return res;
        })
        .catch(async () => (await caches.match(req)) || Response.error())
    );
    return;
  }

  // 5) Cualquier otro GET mismo-origen: pasa directo a la red (sin interceptar).
});

function isStaticAsset(url) {
  try {
    const u = new URL(url);
    return (
      u.pathname.startsWith("/_next/static/") ||
      /\.(js|css|woff2?|png|jpe?g|svg|ico|webmanifest)$/i.test(u.pathname)
    );
  } catch {
    return false;
  }
}
