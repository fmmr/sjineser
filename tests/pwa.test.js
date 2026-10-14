import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { appVersion, cacheVersion, canRegisterServiceWorker, registerServiceWorker } from '../docs/js/pwa.js';
import {
  ABOUT_DATA, codeStats, computeVersion, countLines, isShippable, renderAboutData, shippableFiles,
} from '../scripts/stamp-sw.mjs';

const SW_SOURCE = readFileSync(new URL('../docs/sw.js', import.meta.url), 'utf8');
const SCOPE = 'https://sjineser.rodland.no/';
const STALE = 'docs/ changed since the last stamp: run `npm run stamp` and commit docs/sw.js';

/** The VERSION and PRECACHE of the generated block in sw.js. */
function stamped() {
  const version = SW_SOURCE.match(/^const VERSION = '([0-9a-f]+)';$/m)?.[1];
  const list = SW_SOURCE.match(/^const PRECACHE = \[\n([\s\S]*?)\];$/m)?.[1] ?? '';
  return { version, precache: [...list.matchAll(/'([^']+)'/g)].map((match) => match[1]) };
}

/** Fake Response: `body` identifies where it came from. */
const response = (body) => ({ body, ok: true, type: 'basic', clone: () => response(body) });

/** Fake CacheStorage keyed by absolute URL, plus a fetch log. */
function fakeEnvironment({ online = true, existing = {} } = {}) {
  const stores = new Map(Object.entries(existing).map(([name, entries]) => [name, new Map(Object.entries(entries))]));
  const fetched = [];
  const urlOf = (request) => (typeof request === 'string' ? request : request.url);
  const cacheObject = (store) => ({
    match: async (request) => store.get(urlOf(request)),
    put: async (request, value) => {
      store.set(urlOf(request), value);
    },
    addAll: async (requests) => {
      const responses = await Promise.all(requests.map((request) => fetch(request)));
      requests.forEach((request, i) => store.set(urlOf(request), responses[i]));
    },
  });
  const caches = {
    open: async (name) => {
      if (!stores.has(name)) stores.set(name, new Map());
      return cacheObject(stores.get(name));
    },
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    match: async (request) => {
      for (const store of stores.values()) if (store.has(urlOf(request))) return store.get(urlOf(request));
      return undefined;
    },
  };
  async function fetch(request) {
    fetched.push(request);
    if (!online) throw new TypeError('offline');
    return response(`network:${urlOf(request)}`);
  }
  class Request {
    constructor(url, init = {}) {
      this.url = String(url);
      this.cache = init.cache;
    }
  }
  return { stores, fetched, caches, fetch, Request };
}

/** Runs sw.js with a fake worker global; returns its listeners and the fake environment. */
function loadWorker(options) {
  const env = fakeEnvironment(options);
  const listeners = {};
  const calls = { skipWaiting: 0, claim: 0 };
  const self = {
    registration: { scope: SCOPE },
    addEventListener: (type, listener) => {
      listeners[type] = listener;
    },
    skipWaiting: async () => {
      calls.skipWaiting += 1;
    },
    clients: {
      claim: async () => {
        calls.claim += 1;
      },
    },
  };
  vm.runInNewContext(SW_SOURCE, { self, URL, Request: env.Request, caches: env.caches, fetch: env.fetch });
  return { listeners, calls, ...env };
}

/** Dispatches a lifecycle event and waits for its waitUntil promise. */
async function lifecycle(worker, type) {
  let pending = Promise.resolve();
  worker.listeners[type]({ waitUntil: (promise) => { pending = promise; } });
  await pending;
}

/** Dispatches a fetch event; resolves to the response, or null when the worker ignores it. */
async function dispatchFetch(worker, url, { method = 'GET', mode = 'cors' } = {}) {
  let answer = null;
  worker.listeners.fetch({
    request: { url, method, mode },
    respondWith: (promise) => { answer = promise; },
    waitUntil: () => {},
  });
  return answer && await answer;
}

test('service worker registers on https and localhost only', () => {
  assert.equal(canRegisterServiceWorker({ protocol: 'https:', hostname: 'sjineser.rodland.no' }), true);
  assert.equal(canRegisterServiceWorker({ protocol: 'http:', hostname: 'localhost' }), true);
  assert.equal(canRegisterServiceWorker({ protocol: 'http:', hostname: '127.0.0.1' }), true);
  assert.equal(canRegisterServiceWorker({ protocol: 'http:', hostname: '192.168.1.20' }), false);
});

test('shippable files: everything under docs/ except the worker, CNAME, dotfiles and Markdown', () => {
  assert.equal(isShippable('index.html'), true);
  assert.equal(isShippable('vendor/chart.js/4.5.1/chart.umd.min.js'), true);
  assert.equal(isShippable('sw.js'), false);
  assert.equal(isShippable('CNAME'), false);
  assert.equal(isShippable('vendor/chart.js/4.5.1/LICENSE.md'), false);
  assert.equal(isShippable('icons/.DS_Store'), false);
  const files = shippableFiles();
  for (const path of ['index.html', 'manifest.webmanifest', 'favicon.ico', 'js/theme-init.js', 'js/main.js',
    'js/sandbox/backend.js', 'js/views/sandbox-bar.js', 'vendor/chart.js/4.5.1/chart.umd.min.js',
    'css/components.css', 'icons/apple-touch-icon.png', ABOUT_DATA]) {
    assert.ok(files.includes(path), path);
  }
});

test('countLines: newline-separated, a final newline does not add a line', () => {
  assert.equal(countLines(''), 0);
  assert.equal(countLines('a'), 1);
  assert.equal(countLines('a\nb\n'), 2);
  assert.equal(countLines('a\n\nb'), 3);
});

test('js/about-data.js holds the code statistics the stamp script would generate now', () => {
  const source = readFileSync(new URL(`../docs/${ABOUT_DATA}`, import.meta.url), 'utf8');
  assert.equal(source, renderAboutData(codeStats()), 'code statistics are stale: run `npm run stamp` and commit docs/js/about-data.js');
});

test('PRECACHE in sw.js lists exactly the shippable files on disk', () => {
  assert.deepEqual(stamped().precache, shippableFiles(), STALE);
});

test('VERSION in sw.js is the content hash of the precached files', () => {
  assert.match(stamped().version ?? '', /^[0-9a-f]{12}$/);
  assert.equal(stamped().version, computeVersion(shippableFiles()), STALE);
});

test('install precaches every file into the versioned cache, bypassing the HTTP cache', async () => {
  const worker = loadWorker();
  await lifecycle(worker, 'install');
  const { version, precache } = stamped();
  const cache = worker.stores.get(`sjineser-${version}`);
  assert.deepEqual([...cache.keys()].sort(), precache.map((path) => SCOPE + path).sort());
  assert.ok(worker.fetched.every((request) => request.cache === 'reload'));
  assert.equal(worker.calls.skipWaiting, 1);
});

test('activate deletes other sjineser-* caches only, then claims the clients', async () => {
  const name = `sjineser-${stamped().version}`;
  const worker = loadWorker({ existing: { [name]: {}, 'sjineser-v1': {}, 'sjineser-0123456789ab': {}, 'other-app': {} } });
  await lifecycle(worker, 'activate');
  assert.deepEqual([...worker.stores.keys()].sort(), [name, 'other-app'].sort());
  assert.equal(worker.calls.claim, 1);
});

test('navigations get the cached index.html of the current version, also offline and with ?sandbox', async () => {
  const name = `sjineser-${stamped().version}`;
  const worker = loadWorker({ online: false, existing: { [name]: { [`${SCOPE}index.html`]: response('cached-index') } } });
  for (const url of [SCOPE, `${SCOPE}?sandbox`, `${SCOPE}index.html`, `${SCOPE}?sandbox#/stats`]) {
    assert.equal((await dispatchFetch(worker, url, { mode: 'navigate' }))?.body, 'cached-index', url);
  }
  assert.equal(worker.fetched.length, 0);
});

test('a navigation falls back to the network when index.html is not cached', async () => {
  const worker = loadWorker();
  assert.equal((await dispatchFetch(worker, `${SCOPE}?sandbox`, { mode: 'navigate' }))?.body, `network:${SCOPE}?sandbox`);
});

test('cached assets come from the current cache without the network', async () => {
  const name = `sjineser-${stamped().version}`;
  const old = 'sjineser-0123456789ab';
  const worker = loadWorker({
    existing: {
      [old]: { [`${SCOPE}js/router.js`]: response('old-router') },
      [name]: { [`${SCOPE}js/main.js`]: response('cached-main') },
    },
  });
  assert.equal((await dispatchFetch(worker, `${SCOPE}js/main.js`))?.body, 'cached-main');
  assert.equal(worker.fetched.length, 0);
  // Never from another version's cache.
  assert.equal((await dispatchFetch(worker, `${SCOPE}js/router.js`))?.body, `network:${SCOPE}js/router.js`);
});

test('uncached same-origin requests go to the network and are not cached', async () => {
  const name = `sjineser-${stamped().version}`;
  const worker = loadWorker({ existing: { [name]: { [`${SCOPE}js/main.js`]: response('cached-main') } } });
  for (const url of [`${SCOPE}robots.txt`, `${SCOPE}js/main.js?v=2`]) {
    assert.equal((await dispatchFetch(worker, url))?.body, `network:${url}`);
  }
  assert.deepEqual([...worker.stores.get(name).keys()], [`${SCOPE}js/main.js`]);
});

test('cross-origin requests and non-GET requests are never intercepted', async () => {
  const worker = loadWorker();
  assert.equal(await dispatchFetch(worker, 'https://script.google.com/macros/s/x/exec?action=data'), null);
  assert.equal(await dispatchFetch(worker, 'https://script.googleusercontent.com/macros/echo?x=1'), null);
  assert.equal(await dispatchFetch(worker, `${SCOPE}js/main.js`, { method: 'POST' }), null);
  assert.equal(worker.fetched.length, 0);
});

test('the worker has no message handler (no warm-up)', () => {
  assert.equal(loadWorker().listeners.message, undefined);
});

test('registerServiceWorker waits for the load event, or registers at once after it', async () => {
  const registered = [];
  const container = { register: async (path) => { registered.push(path); } };
  const location = { protocol: 'https:', hostname: 'sjineser.rodland.no' };
  const loadListeners = [];
  const window = { addEventListener: (type, listener) => loadListeners.push({ type, listener }) };
  registerServiceWorker({ container, location, window, document: { readyState: 'interactive' } });
  assert.deepEqual(registered, []);
  assert.equal(loadListeners[0].type, 'load');
  loadListeners[0].listener();
  assert.deepEqual(registered, ['sw.js']);
  registerServiceWorker({ container, location, window, document: { readyState: 'complete' } });
  assert.deepEqual(registered, ['sw.js', 'sw.js']);
  registerServiceWorker({ container, location: { protocol: 'http:', hostname: '10.0.0.2' }, window, document: { readyState: 'complete' } });
  assert.equal(registered.length, 2);
});

test('cacheVersion reads VERSION from the sjineser-* cache name, null without one or on errors', async () => {
  assert.equal(await cacheVersion({ keys: async () => ['other', 'sjineser-abc123def456'] }), 'abc123def456');
  assert.equal(await cacheVersion({ keys: async () => ['other'] }), null);
  assert.equal(await cacheVersion({ keys: async () => { throw new Error('denied'); } }), null);
  assert.equal(await cacheVersion(undefined), null);
});

test('appVersion looks again once the worker is active when the cache is not there yet', async () => {
  const names = [];
  const caches = { keys: async () => [...names] };
  let activate;
  const container = { ready: new Promise((resolve) => { activate = resolve; }) };
  const pending = appVersion({ caches, container });
  names.push('sjineser-0123456789ab');
  activate();
  assert.equal(await pending, '0123456789ab');
  assert.equal(await appVersion({ caches: { keys: async () => ['sjineser-fedcba'] }, container: { ready: new Promise(() => {}) } }), 'fedcba');
  assert.equal(await appVersion({ caches: { keys: async () => [] }, container: undefined }), null);
});
