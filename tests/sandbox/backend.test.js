import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSandboxApi } from '../../docs/js/sandbox/backend.js';
import { generateHistory } from '../../docs/js/sandbox/generate.js';
import { createActions } from '../../docs/js/state/actions.js';
import { TODAY_KEY, createClock } from '../../docs/js/state/clock.js';
import { createOutbox } from '../../docs/js/state/outbox.js';
import { createStorage } from '../../docs/js/state/storage.js';
import { createStore } from '../../docs/js/state/store.js';
import { memoryBackend } from '../helpers.js';

const generated = generateHistory();
const DATE = generated.nextDate;
const MATCH = `${DATE}#1`;
const freshStorage = () => createStorage(memoryBackend(), 'sjineser-sandbox:');

/** Starts a night and match #1 on the pretend date; returns the api. */
async function withMatch(storage = freshStorage()) {
  const api = createSandboxApi({ storage });
  await api.post('startNight', { date: DATE, players: ['Anne', 'Bjørn', 'Cato', 'Dag'] }, 'any');
  await api.post('startMatch', { matchId: MATCH, date: DATE, A1: 'Anne', A2: 'Bjørn', B1: 'Cato', B2: 'Dag' }, 'any');
  return api;
}

test('the first getAll returns the generated history and stores today as nextDate', async () => {
  const storage = freshStorage();
  const response = await createSandboxApi({ storage }).getAll();
  assert.deepEqual(response, { ok: true, result: 'noop', data: generated.dataset });
  assert.equal(storage.get('today', null), DATE);
});

test('an existing pretend date is kept', async () => {
  const storage = freshStorage();
  storage.set('today', '2026-12-24');
  await createSandboxApi({ storage }).getAll();
  assert.equal(storage.get('today', null), '2026-12-24');
});

test('post applies ops and persists them across instances on the same storage', async () => {
  const storage = freshStorage();
  const api = await withMatch(storage);
  assert.deepEqual(await api.post('addGame', { matchId: MATCH, gameNo: 1, result: 'A', timestamp: 't' }, ''),
    { ok: true, result: 'applied' });
  const { data } = await createSandboxApi({ storage }).getAll();
  assert.ok(data.games.some((g) => g.matchId === MATCH && g.result === 'A'));
});

test('addPlayer returns the name like the server', async () => {
  const api = createSandboxApi({ storage: freshStorage() });
  assert.deepEqual(await api.post('addPlayer', { name: ' Gro ' }), { ok: true, result: 'applied', data: { name: 'Gro' } });
  assert.deepEqual(await api.post('addPlayer', { name: 'anne' }), { ok: true, result: 'noop', data: { name: 'Anne' } });
});

test('duplicate ops are noops; conflicting and invalid ops fail with an envelope', async () => {
  const api = await withMatch();
  const game = { matchId: MATCH, gameNo: 1, result: 'A', timestamp: 't' };
  await api.post('addGame', game);
  assert.deepEqual(await api.post('addGame', game), { ok: true, result: 'noop' });
  assert.deepEqual(await api.post('addGame', { ...game, result: 'B' }), { ok: false, error: 'conflict', message: 'conflict' });
  assert.deepEqual(await api.post('nonsense', {}), { ok: false, error: 'invalid', message: 'invalid' });
});

test('mutating a getAll result does not change the stored data', async () => {
  const api = createSandboxApi({ storage: freshStorage() });
  (await api.getAll()).data.games.length = 0;
  assert.deepEqual((await api.getAll()).data, generated.dataset);
});

test('reset restores the generated history and the pretend date', async () => {
  const storage = freshStorage();
  const api = await withMatch(storage);
  storage.set('today', '2027-01-01');
  api.reset();
  assert.deepEqual((await api.getAll()).data, generated.dataset);
  assert.equal(storage.get('today', null), DATE);
});

test('creating the api seeds the data and pretend date at once, before any request', () => {
  const storage = freshStorage();
  createSandboxApi({ storage });
  assert.equal(storage.get('today', null), DATE);
  assert.deepEqual(storage.get('sandboxData', null), generated.dataset);
});

test('the pretend date is stored under the clock\'s TODAY_KEY', () => {
  const storage = freshStorage();
  createSandboxApi({ storage });
  assert.equal(TODAY_KEY, 'today');
  assert.equal(storage.get(TODAY_KEY, null), DATE);
  assert.equal(createClock({ storage }).today(), DATE);
});

test('sandbox api, outbox and store never write to the real storage namespace', async () => {
  const backend = memoryBackend();
  const real = createStorage(backend, 'sjineser:');
  real.set('pin', '1234');
  const storage = createStorage(backend, 'sjineser-sandbox:');
  const api = createSandboxApi({ storage });
  let store;
  const outbox = createOutbox({
    storage,
    send: (op) => api.post(op.action, op.payload, ''),
    onSent: (op) => store.commit(op),
    onChange: () => store?.recompute(),
  });
  store = createStore({ storage, outbox, api });
  const clock = createClock({ storage });
  const actions = createActions({ store, outbox, clock });

  await store.refresh();
  assert.deepEqual(actions.startNight(['Anne', 'Bjørn', 'Cato', 'Dag']), { ok: true });
  await outbox.flush();
  api.reset();

  assert.ok(store.get().nights.some((night) => night.date === DATE));
  assert.deepEqual(backend.keys().filter((key) => key.startsWith('sjineser:')), ['sjineser:pin']);
  assert.ok(backend.keys().includes('sjineser-sandbox:outbox'));
});

test('player management uses the same rules: rename everywhere, retry is a noop, delete needs no history', async () => {
  const storage = freshStorage();
  const api = await withMatch(storage);
  assert.deepEqual(await api.post('renamePlayer', { from: 'Anne', to: 'Annette' }, 'any'), { ok: true, result: 'applied' });
  assert.deepEqual(await api.post('renamePlayer', { from: 'Anne', to: 'Annette' }, 'any'), { ok: true, result: 'noop' });
  const { data } = await api.getAll();
  assert.equal(data.matches.find((m) => m.matchId === MATCH).A1, 'Annette');
  assert.ok(!JSON.stringify(data).includes('"Anne"'));
  assert.equal((await api.post('deletePlayer', { name: 'Annette' }, 'any')).error, 'invalid');
  assert.equal((await api.post('renamePlayer', { from: 'Annette', to: 'bjørn' }, 'any')).error, 'conflict');
});
