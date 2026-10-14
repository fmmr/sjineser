/**
 * Service worker registration (spec §10). The worker itself is docs/sw.js.
 */

/**
 * Service workers need a secure context: https, or localhost for development.
 * @param {{ protocol: string, hostname: string }} location
 * @returns {boolean}
 */
export function canRegisterServiceWorker({ protocol, hostname }) {
  return protocol === 'https:' || hostname === 'localhost' || hostname === '127.0.0.1';
}

/**
 * Registers sw.js once the page has loaded, so it never competes with startup. Failures are
 * ignored: the app works without a worker, just not offline. A new release takes effect on
 * the next launch (docs/sw.js).
 * @param {{ container?: ServiceWorkerContainer, location?: Location, window?: Window,
 *   document?: Document }} [env] the browser globals by default (injectable for tests)
 */
export function registerServiceWorker({
  container = globalThis.navigator?.serviceWorker, location = globalThis.location,
  window = globalThis.window, document = globalThis.document,
} = {}) {
  if (!container || !canRegisterServiceWorker(location)) return;
  const register = () => container.register('sw.js').catch(() => undefined);
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

const CACHE_PREFIX = 'sjineser-';

/**
 * VERSION of the service-worker cache (`sjineser-<VERSION>`, spec §10), or null without one.
 * @param {Pick<CacheStorage, 'keys'> | undefined} [caches] the browser's by default (injectable for tests)
 * @returns {Promise<string | null>}
 */
export async function cacheVersion(caches = globalThis.caches) {
  try {
    const keys = (await caches?.keys()) ?? [];
    const key = keys.find((name) => name.startsWith(CACHE_PREFIX));
    return key ? key.slice(CACHE_PREFIX.length) : null;
  } catch {
    return null;
  }
}

/**
 * The installed app version. On a first visit the worker may still be installing, so without
 * a cache it looks again once the worker is active; that promise stays pending without a worker.
 * @param {{ caches?: Pick<CacheStorage, 'keys'>, container?: Pick<ServiceWorkerContainer, 'ready'> }} [env]
 *   the browser globals by default (injectable for tests)
 * @returns {Promise<string | null>}
 */
export async function appVersion({ caches = globalThis.caches, container = globalThis.navigator?.serviceWorker } = {}) {
  const found = await cacheVersion(caches);
  if (found || !container) return found;
  await container.ready;
  return cacheVersion(caches);
}
