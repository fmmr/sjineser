import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../docs/js/state/store.js';
import { createStorage } from '../../docs/js/state/storage.js';
import { emptyDataset } from '../../docs/js/domain/dataset.js';
import { MATCH_1, memoryBackend, nightWithMatch } from '../helpers.js';

const addGame = (gameNo, result = 'A') => ({ id: `g${gameNo}`, action: 'addGame', payload: { matchId: MATCH_1, gameNo, result, timestamp: 'T' } });

function setup({ cached = null, pending = [], getAll = async () => ({ ok: false, error: 'network' }) } = {}) {
  const storage = createStorage(memoryBackend());
  if (cached) storage.set('dataset', cached);
  const outbox = { pending: () => pending };
  const store = createStore({ storage, outbox, api: { getAll } });
  return { store, storage, pending };
}

test('view is the cached dataset plus pending ops', () => {
  const { store } = setup({ cached: nightWithMatch(['A']), pending: [addGame(2, 'D')] });
  assert.equal(store.isLoaded(), true);
  assert.deepEqual(store.get().games.map((g) => g.result), ['A', 'D']);
});

test('without cache the store starts empty and not loaded', () => {
  const { store } = setup();
  assert.equal(store.isLoaded(), false);
  assert.deepEqual(store.get().games, []);
});

test('refresh replaces server data, persists it and reapplies pending ops idempotently', async () => {
  const fresh = nightWithMatch(['A', 'B']);
  const { store, storage } = setup({ cached: nightWithMatch(), pending: [addGame(2, 'B')], getAll: async () => ({ ok: true, data: fresh }) });
  assert.equal(await store.refresh(), true);
  assert.equal(store.get().games.length, 2);
  assert.deepEqual(storage.get('dataset', null), fresh);
});

test('concurrent refreshes share one request and notify subscribers', async () => {
  let calls = 0;
  const { store } = setup({ getAll: async () => { calls += 1; return { ok: true, data: nightWithMatch() }; } });
  let notified = 0;
  store.subscribe(() => { notified += 1; });
  await Promise.all([store.refresh(), store.refresh()]);
  assert.equal(calls, 1);
  assert.equal(notified, 1);
});

test('a refresh with unchanged data does not notify subscribers', async () => {
  const { store } = setup({ cached: nightWithMatch(['A']), getAll: async () => ({ ok: true, data: nightWithMatch(['A']) }) });
  await store.refresh();
  let notified = 0;
  store.subscribe(() => { notified += 1; });
  await store.refresh();
  assert.equal(notified, 0);
});

test('commit applies a sent op to server data', () => {
  const { store, storage } = setup({ cached: nightWithMatch() });
  store.commit(addGame(1));
  assert.equal(storage.get('dataset', null).games.length, 1);
});

test('ops committed while a refresh is in flight survive the stale response', async () => {
  let respond;
  const { store } = setup({ cached: nightWithMatch(), getAll: () => new Promise((r) => { respond = r; }) });
  const refreshing = store.refresh();
  store.commit(addGame(1));
  respond({ ok: true, data: nightWithMatch() });
  await refreshing;
  assert.equal(store.get().games.length, 1);
});

test('a failed refresh leaves the store unchanged and resolves to false', async () => {
  const empty = setup({ getAll: async () => ({ ok: false, error: 'network' }) });
  assert.equal(await empty.store.refresh(), false);
  assert.equal(empty.store.isLoaded(), false);
  const cached = nightWithMatch(['A']);
  const { store, storage } = setup({ cached, getAll: async () => ({ ok: false, error: 'busy' }) });
  assert.equal(await store.refresh(), false);
  assert.equal(store.isLoaded(), true);
  assert.deepEqual(store.get(), cached);
  assert.deepEqual(storage.get('dataset', null), cached);
});

test('a deleteGame committed while a refresh is in flight is reapplied to the response', async () => {
  let respond;
  const { store } = setup({ cached: nightWithMatch(['A', 'B']), getAll: () => new Promise((r) => { respond = r; }) });
  const refreshing = store.refresh();
  store.commit({ id: 'd2', action: 'deleteGame', payload: { matchId: MATCH_1, gameNo: 2 } });
  respond({ ok: true, data: nightWithMatch(['A', 'B']) });
  await refreshing;
  assert.deepEqual(store.get().games.map((g) => g.gameNo), [1]);
});

test('recompute with an unchanged view does not notify subscribers', () => {
  const { store } = setup({ cached: nightWithMatch(['A']) });
  let notified = 0;
  store.subscribe(() => { notified += 1; });
  store.recompute();
  assert.equal(notified, 0);
});

test('recompute notifies subscribers when a pending op changes the view', () => {
  const { store, pending } = setup({ cached: nightWithMatch(['A']) });
  let notified = 0;
  store.subscribe(() => { notified += 1; });
  pending.push(addGame(2, 'B'));
  store.recompute();
  assert.equal(notified, 1);
  assert.equal(store.get().games.length, 2);
});

test('the first successful refresh notifies even when data equals the current view', async () => {
  const { store } = setup({ getAll: async () => ({ ok: true, data: emptyDataset() }) });
  let notified = 0;
  store.subscribe(() => { notified += 1; });
  await store.refresh();
  assert.equal(store.isLoaded(), true);
  assert.equal(notified, 1);
});

test('hasTried flips after the first refresh, success or failure, and notifies once', async () => {
  const failing = setup();
  let notified = 0;
  failing.store.subscribe(() => { notified += 1; });
  assert.equal(failing.store.hasTried(), false);
  assert.equal(await failing.store.refresh(), false);
  assert.equal(failing.store.hasTried(), true);
  assert.equal(notified, 1);
  await failing.store.refresh();
  assert.equal(notified, 1);

  const ok = setup({ getAll: async () => ({ ok: true, data: nightWithMatch() }) });
  await ok.store.refresh();
  assert.equal(ok.store.hasTried(), true);
});
