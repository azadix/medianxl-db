/* Service worker: cache tree_data JSON and class atlas images after first fetch.
 * __CACHE_VERSION__ is replaced at vite build (see vite.config.js). */

const CACHE_NAME = 'medianxl-tree-__CACHE_VERSION__';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('medianxl-tree-') && k !== CACHE_NAME)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

/**
 * @param {string} url
 */
function shouldCacheTreeDataRequest(url) {
  let pathname;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return false;
  }
  if (!pathname.includes('/tree_data/')) return false;
  if (pathname.endsWith('.json')) return true;
  if (/\/class-[a-z]+\.(webp|png)$/i.test(pathname)) return true;
  return false;
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!shouldCacheTreeDataRequest(event.request.url)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request, { ignoreSearch: false }).then((cached) => {
        if (cached) return cached;
        return fetch(event.request)
          .then((res) => {
            if (res && res.ok && res.type === 'basic') {
              try {
                cache.put(event.request, res.clone());
              } catch {
                /* ignore quota / partial failures */
              }
            }
            return res;
          })
          .catch(() => cached);
      })
    )
  );
});
