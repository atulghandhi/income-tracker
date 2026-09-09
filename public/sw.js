// The Income Tracker service worker.
//
// Goals: make the app installable, open instantly on repeat visits, and keep
// working offline (the ledger lives in IndexedDB, so the shell is all we need).
//
// Strategy:
//   - Navigations and HTML: network first, falling back to the cached copy, then
//     to a tiny offline page. This means a new deploy is picked up on the next
//     load rather than being pinned behind a stale cache.
//   - Hashed build assets (/assets/*): cache first. Vite fingerprints them, so a
//     cached copy is always the right one.
//   - Everything else same-origin (icons, static guides, templates): stale while
//     revalidate.
//   - Cross-origin requests (Supabase, analytics, fonts): never intercepted.

const VERSION = "it-sw-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icon.svg", "/icon.png", "/site.webmanifest"]).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_vercel/")) return;

  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    const shell = await cache.match("/", { ignoreSearch: true });
    if (shell && request.mode === "navigate" && new URL(request.url).pathname === "/") return shell;
    const offline = await cache.match(OFFLINE_URL);
    return offline || new Response("Offline", { status: 503, headers: { "content-type": "text/plain" } });
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  return cached || (await network) || new Response("", { status: 504 });
}
