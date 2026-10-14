import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSandboxApi } from '../../docs/js/sandbox/backend.js';
import { generateHistory } from '../../docs/js/sandbox/generate.js';
import { createStorage } from '../../docs/js/state/storage.js';
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
