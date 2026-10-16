/**
 * Pokecircle service worker (production build only, registered by main.tsx).
 * - /assets/* (named by their hash) and /sounds/*: from the cache after the first visit; a new version of a file
 *   replaces the old one (same name prefix);
 * - card images relayed by the server (/tcgdex/*): from their own cache, at most IMAGE_MAX of them (the oldest go);
 *   images taken from TCGdex directly stay with the browser's cache;
 * - the page: network first, cache when offline (a game against the AI without network).
 * Neither online play (/ws) nor /healthz go through the cache.
 */
const CACHE = "pokecircle-v1";
const IMAGES = "pokecircle-images-v1";
const IMAGE_MAX = 1500;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== IMAGES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** "index-CtvfSpgD.js" → "index-": the old versions of the same file. */
const prefixOf = (path) => path.replace(/-[\w-]{6,}\.(js|css)$/, "-");

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/assets/")) {
      const prefix = prefixOf(path);
      for (const old of await cache.keys()) {
        const p = new URL(old.url).pathname;
        if (p !== path && p.startsWith("/assets/") && prefixOf(p) === prefix) await cache.delete(old);
      }
    }
    await cache.put(request, res.clone());
  }
  return res;
}

async function image(request) {
  const cache = await caches.open(IMAGES);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    await cache.put(request, res.clone());
    // Keys are in insertion order: the oldest images go first.
    const keys = await cache.keys();
    for (const old of keys.slice(0, Math.max(0, keys.length - IMAGE_MAX))) await cache.delete(old);
  }
  return res;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) await cache.put("/", res.clone());
    return res;
  } catch {
    return (await cache.match("/")) ?? Response.error();
  }
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/sounds/")) e.respondWith(cacheFirst(e.request));
  else if (url.pathname.startsWith("/tcgdex/")) e.respondWith(image(e.request));
  else if (e.request.mode === "navigate") e.respondWith(networkFirst(e.request));
});
