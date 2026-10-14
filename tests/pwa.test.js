import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import { canRegisterServiceWorker } from '../docs/js/pwa.js';

const SW_SOURCE = readFileSync(new URL('../docs/sw.js', import.meta.url), 'utf8');
const SCOPE = 'https://sjineser.rodland.no/';

/** Runs sw.js in a sandbox with a fake worker global; returns its event listeners. */
function loadWorker() {
  const listeners = {};
  const self = {
    registration: { scope: SCOPE },
    addEventListener: (type, listener) => {
      listeners[type] = listener;
    },
  };
  vm.runInNewContext(SW_SOURCE, { self, URL, Request: class {}, caches: {}, fetch: () => Promise.reject(new Error('offline')) });
  return listeners;
}

/** Dispatches a fake fetch event; true when the worker answers it. */
function handles(listeners, url, { method = 'GET', mode = 'cors' } = {}) {
  let responded = false;
  listeners.fetch({
    request: { url, method, mode },
    respondWith: (response) => {
      responded = true;
      response.catch(() => {}); // the fake caches reject; only routing is under test
    },
    waitUntil: () => {},
  });
  return responded;
}

test('service worker registers on https and localhost only', () => {
  assert.equal(canRegisterServiceWorker({ protocol: 'https:', hostname: 'sjineser.rodland.no' }), true);
  assert.equal(canRegisterServiceWorker({ protocol: 'http:', hostname: 'localhost' }), true);
  assert.equal(canRegisterServiceWorker({ protocol: 'http:', hostname: '127.0.0.1' }), true);
  assert.equal(canRegisterServiceWorker({ protocol: 'http:', hostname: '192.168.1.20' }), false);
});

test('the cache is versioned and every precached file exists', () => {
  assert.match(SW_SOURCE, /const CACHE = 'sjineser-v\d+';/);
  const list = SW_SOURCE.match(/const PRECACHE = \[([\s\S]*?)\];/)[1];
  const paths = [...list.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.ok(list.includes('INDEX'));
  assert.ok(paths.length > 5);
  for (const path of paths) assert.ok(existsSync(new URL(`../docs/${path}`, import.meta.url)), path);
});

test('service worker answers same-origin GETs and navigations only', () => {
  const listeners = loadWorker();
  assert.equal(handles(listeners, `${SCOPE}js/main.js`), true);
  assert.equal(handles(listeners, `${SCOPE}vendor/chart.js/4.5.1/chart.umd.min.js`), true);
  assert.equal(handles(listeners, `${SCOPE}?sandbox`, { mode: 'navigate' }), true);
  assert.equal(handles(listeners, `${SCOPE}js/main.js?v=2`), false);
  assert.equal(handles(listeners, `${SCOPE}js/main.js`, { method: 'POST' }), false);
  assert.equal(handles(listeners, 'https://script.google.com/macros/s/x/exec?action=data'), false);
  assert.equal(handles(listeners, 'https://script.googleusercontent.com/macros/echo?x=1'), false);
});
