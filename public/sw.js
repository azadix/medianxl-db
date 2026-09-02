/* Service worker: cache app shell + CDN CSS, and static game assets after first fetch
 * (tree_data, items, icons, patch_notes). __CACHE_VERSION__ is replaced at vite build (see vite.config.js). */

const DATA_CACHE = 'medianxl-tree-__CACHE_VERSION__';
const SHELL_CACHE = 'medianxl-shell-__CACHE_VERSION__';
const CDN_CACHE = 'medianxl-cdn-__CACHE_VERSION__';

const CDN_ORIGINS = new Set(['https://cdnjs.cloudflare.com']);

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  const keep = new Set([DATA_CACHE, SHELL_CACHE, CDN_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (k) =>
                (k.startsWith('medianxl-tree-') ||
                  k.startsWith('medianxl-shell-') ||
                  k.startsWith('medianxl-cdn-')) &&
                !keep.has(k)
            )
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

/**
 * Patch list must not be cache-first (new notes would stay hidden until the next SW version).
 * @param {string} pathname
 */
function isPatchNotesIndex(pathname) {
  return pathname.includes('/patch_notes/') && /\/index\.json$/i.test(pathname);
}

/**
 * @param {string} url
 */
function shouldCacheStaticRequest(url) {
  let pathname;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return false;
  }
  if (pathname.includes('/patch_notes/')) {
    if (isPatchNotesIndex(pathname)) return false;
    return /\.(json|md)$/i.test(pathname);
  }
  // Never cache-first PWA/favicon art (blocks icon updates).
  if (pathname.includes('/icons/pwa/')) return false;
  if (pathname.includes('/items/')) {
    if (pathname.endsWith('.json')) return true;
    return /\.(webp|png|gif|jpe?g)$/i.test(pathname);
  }
  if (pathname.includes('/icons/')) {
    return /\.(webp|png|gif|jpe?g)$/i.test(pathname);
  }
  if (!pathname.includes('/tree_data/')) return false;
  if (pathname.endsWith('.json')) return true;
  if (/\/class-[a-z]+\.(webp|png)$/i.test(pathname)) return true;
  return false;
}

/**
 * @param {URL} url
 */
function isSameOriginShellRequest(url) {
  if (url.origin !== self.location.origin) return false;
  const path = url.pathname;
  // App shell under /medianxl-db/ (or local preview base), excluding large data dirs
  if (path.includes('/tree_data/') || path.includes('/patch_notes/') || path.includes('/items/')) {
    return false;
  }
  // Do not SW-cache PWA icons or the manifest — always hit the network when online.
  if (path.includes('/icons/pwa/') || path.endsWith('.webmanifest')) return false;
  if (path.includes('/icons/')) return false;
  return (
    path.endsWith('/') ||
    path.endsWith('.html') ||
    path.endsWith('.js') ||
    path.endsWith('.css') ||
    path.includes('/assets/')
  );
}

/**
 * @param {URL} url
 */
function isCdnAsset(url) {
  if (!CDN_ORIGINS.has(url.origin)) return false;
  return /\.(css|woff2?|ttf|otf|eot|svg)$/i.test(url.pathname);
}

/**
 * Cache-first for static game data.
 * @param {Request} request
 * @param {string} cacheName
 */
function cacheFirst(request, cacheName) {
  return caches.open(cacheName).then((cache) =>
    cache.match(request, { ignoreSearch: false }).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((res) => {
          if (res && res.ok && (res.type === 'basic' || res.type === 'cors')) {
            try {
              cache.put(request, res.clone());
            } catch {
              /* ignore quota / partial failures */
            }
          }
          return res;
        })
        .catch(() => cached);
    })
  );
}

/**
 * Network-first with cache fallback (app shell / navigations).
 * @param {Request} request
 * @param {string} cacheName
 */
function networkFirst(request, cacheName) {
  return caches.open(cacheName).then((cache) =>
    fetch(request)
      .then((res) => {
        if (res && res.ok && res.type === 'basic') {
          try {
            cache.put(request, res.clone());
          } catch {
            /* ignore */
          }
        }
        return res;
      })
      .catch(async () => {
        const cached = await cache.match(request);
        if (cached) return cached;
        // SPA deep-link fallback: serve cached index/404 shell
        if (request.mode === 'navigate') {
          const base = new URL('.', self.registration.scope).pathname;
          const candidates = [`${base}`, `${base}index.html`, `${base}404.html`];
          for (const path of candidates) {
            const fallback = await cache.match(path);
            if (fallback) return fallback;
          }
        }
        return Response.error();
      })
  );
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  let url;
  try {
    url = new URL(event.request.url);
  } catch {
    return;
  }

  if (isPatchNotesIndex(url.pathname)) {
    event.respondWith(networkFirst(event.request, DATA_CACHE));
    return;
  }

  if (shouldCacheStaticRequest(event.request.url)) {
    event.respondWith(cacheFirst(event.request, DATA_CACHE));
    return;
  }

  if (isCdnAsset(url)) {
    event.respondWith(cacheFirst(event.request, CDN_CACHE));
    return;
  }

  if (event.request.mode === 'navigate' || isSameOriginShellRequest(url)) {
    event.respondWith(networkFirst(event.request, SHELL_CACHE));
  }
});
