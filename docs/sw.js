/*
 * Service worker (spec §10): lets the app start offline.
 *
 * - Precache: the minimal shell below. Bump CACHE ('sjineser-vN') only when this list changes;
 *   every other file stays fresh through stale-while-revalidate.
 * - Navigations: network first (the fresh page is cached as index.html), cached index.html
 *   when offline. ?sandbox and other query strings on navigations share that one entry.
 * - Other same-origin GETs without a query: stale-while-revalidate, so files loaded later
 *   (view modules, Chart.js, sandbox code) work offline after their first use.
 * - Everything else (Apps Script on script.google.com / googleusercontent.com, POSTs) is
 *   never intercepted.
 */

const CACHE = 'sjineser-v1';
const CACHE_PREFIX = 'sjineser-';
const INDEX = 'index.html';

const PRECACHE = [
  './',
  INDEX,
  'manifest.webmanifest',
  'favicon.ico',
  'icons/apple-touch-icon.png',
  'icons/favicon-16x16.png',
  'icons/favicon-32x32.png',
  'icons/android-chrome-192x192.png',
  'icons/android-chrome-512x512.png',
  'css/tokens.css',
  'css/base.css',
  'css/layout.css',
  'css/components.css',
  'css/views/play.css',
  'css/views/about.css',
  'css/views/stats.css',
  'css/sandbox.css',
  'js/theme-init.js',
  'js/main.js',
];

const scopeUrl = new URL(self.registration.scope);
const indexUrl = new URL(INDEX, scopeUrl).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // 'reload' skips the HTTP cache so a new version never precaches stale files.
      .then((cache) => cache.addAll(PRECACHE.map((path) => new Request(path, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE).map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== scopeUrl.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(navigation(event));
    return;
  }
  if (url.search) return;
  event.respondWith(staleWhileRevalidate(event));
});

/*
 * The page posts the files it loaded before this worker took control (first visit), so they
 * are cached at once and the very next start works offline.
 */
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'warm' || !Array.isArray(event.data.urls)) return;
  event.waitUntil(warm(event.data.urls));
});

/**
 * @param {FetchEvent} event
 * @returns {Promise<Response>}
 */
async function navigation(event) {
  const url = new URL(event.request.url);
  const isShell = url.pathname === scopeUrl.pathname || url.href.split(/[?#]/)[0] === indexUrl;
  try {
    const response = await fetch(event.request);
    if (isShell && response.ok && response.type === 'basic') {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then((cache) => cache.put(indexUrl, copy)));
    }
    return response;
  } catch (error) {
    const cached = (isShell ? null : await caches.match(event.request, { ignoreSearch: true }))
      ?? await caches.match(indexUrl);
    if (cached) return cached;
    throw error;
  }
}

/**
 * @param {FetchEvent} event
 * @returns {Promise<Response>}
 */
async function staleWhileRevalidate(event) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(event.request);
  const fresh = fetch(event.request).then((response) => {
    if (response.ok && response.type === 'basic') return cache.put(event.request, response.clone()).then(() => response);
    return response;
  });
  if (cached) {
    event.waitUntil(fresh.catch(() => undefined));
    return cached;
  }
  return fresh;
}

/**
 * Caches same-origin, query-free URLs that are not cached yet.
 * @param {unknown[]} urls
 * @returns {Promise<void>}
 */
async function warm(urls) {
  const cache = await caches.open(CACHE);
  const wanted = urls
    .filter((href) => typeof href === 'string')
    .map((href) => new URL(href, scopeUrl))
    .filter((url) => url.origin === scopeUrl.origin && !url.search && url.pathname.startsWith(scopeUrl.pathname))
    .map((url) => url.origin + url.pathname);
  await Promise.all([...new Set(wanted)].map(async (href) => {
    if (await cache.match(href)) return;
    try {
      const response = await fetch(href);
      if (response.ok && response.type === 'basic') await cache.put(href, response);
    } catch {
      // Offline or gone: it is cached on its next use instead.
    }
  }));
}
