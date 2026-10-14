import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient } from '../../docs/js/api/client.js';

function fakeFetch(respond) {
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push({ url, init });
    return respond(url, init);
  };
  return { calls, fetchFn };
}
const jsonResponse = (body) => ({ json: async () => body });

test('getAll does an uncached GET and returns the envelope', async () => {
  const { calls, fetchFn } = fakeFetch(() => jsonResponse({ ok: true, data: { players: [] } }));
  const api = createApiClient({ url: 'https://x/exec', fetchFn });
  assert.deepEqual(await api.getAll(), { ok: true, data: { players: [] } });
  assert.equal(calls[0].url, 'https://x/exec');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.cache, 'no-store');
});

test('post sends action, payload and pin as a JSON string without headers', async () => {
  const { calls, fetchFn } = fakeFetch(() => jsonResponse({ ok: true, result: 'applied' }));
  const api = createApiClient({ url: 'u', fetchFn });
  await api.post('addPlayer', { name: 'Kari' }, '1234');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers, undefined);
  assert.deepEqual(JSON.parse(calls[0].init.body), { action: 'addPlayer', payload: { name: 'Kari' }, pin: '1234' });
});

test('network failures and non-envelope replies become a network error', async () => {
  const failing = createApiClient({ url: 'u', fetchFn: async () => { throw new TypeError('offline'); } });
  assert.equal((await failing.getAll()).error, 'network');
  const html = createApiClient({ url: 'u', fetchFn: async () => ({ json: async () => { throw new SyntaxError(); } }) });
  assert.equal((await html.getAll()).error, 'network');
  const odd = createApiClient({ url: 'u', fetchFn: async () => jsonResponse({ hello: 1 }) });
  assert.equal((await odd.getAll()).error, 'network');
});

test('both requests carry a timeout abort signal', async () => {
  const { calls, fetchFn } = fakeFetch(() => jsonResponse({ ok: true }));
  const api = createApiClient({ url: 'u', fetchFn });
  await api.getAll();
  await api.post('addPlayer', { name: 'Kari' }, '1234');
  assert.ok(calls[0].init.signal instanceof AbortSignal);
  assert.ok(calls[1].init.signal instanceof AbortSignal);
});
