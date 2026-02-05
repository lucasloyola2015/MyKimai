/**
 * Service Worker básico para PWA MyKimai.
 * Cachea activos estáticos (JS, CSS, imágenes) y ofrece página offline.
 */
const CACHE_NAME = "mykimai-pwa-v1";
const OFFLINE_URL = "/offline";

const STATIC_ASSETS = [
  "/",
  "/offline",
  "/favicon.svg",
  "/icon-192x192.png",
  "/icon-512x512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Si falla alguna URL (ej. en build), no bloquear install
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") {
    // Para recursos (JS, CSS, imágenes): Network First, fallback cache
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const clone = res.clone();
          if (res.ok && isStaticAsset(event.request.url)) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Navegación: Network First, fallback a /offline
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const clone = res.clone();
        if (res.ok) {
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return res;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          return caches.match(OFFLINE_URL).then((offline) => {
            return offline || new Response("Sin conexión", {
              status: 503,
              statusText: "Service Unavailable",
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            });
          });
        });
      })
  );
});

function isStaticAsset(url) {
  try {
    const u = new URL(url);
    return (
      u.pathname.startsWith("/_next/static/") ||
      u.pathname.match(/\.(js|css|woff2?|png|jpg|svg|ico)$/i)
    );
  } catch {
    return false;
  }
}
