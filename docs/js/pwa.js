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
 * Registers sw.js and, once it is active, hands it the files this page already loaded
 * (on a first visit they were fetched before the worker took control). Failures are ignored:
 * the app works without a worker, just not offline.
 */
export function registerServiceWorker() {
  const container = navigator.serviceWorker;
  if (!container || !canRegisterServiceWorker(location)) return;
  container.register('sw.js')
    .then(() => container.ready)
    .then((registration) => {
      const urls = performance.getEntriesByType('resource').map((entry) => entry.name);
      registration.active?.postMessage({ type: 'warm', urls });
    })
    .catch(() => undefined);
}
