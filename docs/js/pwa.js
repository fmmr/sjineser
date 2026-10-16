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

/** How often an open, visible app asks whether a new version exists. */
export const UPDATE_POLL_MS = 5 * 60 * 1000;

/** The fewest milliseconds between two update checks (navigation can be quick). */
export const UPDATE_MIN_INTERVAL_MS = 60 * 1000;

/**
 * Wraps `update` so it runs at most once per `intervalMs`; failures are ignored (offline).
 * @param {() => Promise<unknown>} update
 * @param {{ intervalMs?: number, now?: () => number }} [options]
 * @returns {() => void}
 */
export function throttledUpdate(update, { intervalMs = UPDATE_MIN_INTERVAL_MS, now = () => Date.now() } = {}) {
  let last = -Infinity;
  return () => {
    const time = now();
    if (time - last < intervalMs) return;
    last = time;
    update()?.catch?.(() => undefined);
  };
}

/**
 * Registers sw.js once the page has loaded, so it never competes with startup. Failures are
 * ignored: the app works without a worker, just not offline.
 *
 * Updates: a home-screen app on iOS is usually resumed rather than reloaded, and a desktop tab
 * may stay open for hours, so the browser rarely re-checks sw.js on its own. We ask for an update
 * check when the app becomes visible, on in-app navigation and every UPDATE_POLL_MS while visible
 * (at most once per UPDATE_MIN_INTERVAL_MS).
 * The worker activates a complete new version at once (skipWaiting + claim); when that new
 * worker takes over a page that already had one, `onUpdateReady` is called so the UI can offer
 * a reload. The very first install taking control is not an update.
 * @param {{ container?: ServiceWorkerContainer, location?: Location, window?: Window,
 *   document?: Document, onUpdateReady?: () => void }} [env] browser globals by default (injectable for tests)
 */
export function registerServiceWorker({
  container = globalThis.navigator?.serviceWorker, location = globalThis.location,
  window = globalThis.window, document = globalThis.document, onUpdateReady = () => {},
  setInterval = globalThis.setInterval, now = () => Date.now(),
} = {}) {
  if (!container || !canRegisterServiceWorker(location)) return;
  const hadController = Boolean(container.controller);
  container.addEventListener?.('controllerchange', () => {
    if (hadController) onUpdateReady();
  });

  const register = () => container.register('sw.js')
    .then((registration) => {
      if (!registration?.update) return;
      const check = throttledUpdate(() => registration.update(), { now });
      const visible = () => document.visibilityState === 'visible';
      document.addEventListener?.('visibilitychange', () => {
        if (visible()) check();
      });
      // In-app navigation only changes the hash, which the browser does not treat as a page
      // load, and a desktop tab can stay open for hours: check on navigation and on a timer too.
      window.addEventListener?.('hashchange', check);
      const timer = setInterval?.(() => {
        if (visible()) check();
      }, UPDATE_POLL_MS);
      timer?.unref?.(); // Node (tests) only: a timer must not keep the process alive.
    })
    .catch(() => undefined);
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
