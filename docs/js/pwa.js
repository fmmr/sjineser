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
