import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOutbox } from '../../docs/js/state/outbox.js';
import { createStorage } from '../../docs/js/state/storage.js';
import { DATE, memoryBackend } from '../helpers.js';

const OK = { ok: true, result: 'applied' };

function setup({ responses = [], storage = createStorage(memoryBackend()), onSent = () => {} } = {}) {
  const pendingResponses = [...responses];
  const log = { sent: [], committed: [], dropped: [], pinRequests: 0, retries: [], maxConcurrent: 0 };
  let active = 0;
  let id = 0;
  const outbox = createOutbox({
    storage,
    send: async (op) => {
      active += 1;
      log.maxConcurrent = Math.max(log.maxConcurrent, active);
      log.sent.push(op.action);
      await Promise.resolve();
      active -= 1;
      return pendingResponses.shift() ?? OK;
    },
    onSent: (op) => { onSent(op); log.committed.push(op.action); },
    onDrop: (op, response, dropped) => log.dropped.push(dropped.map((o) => o.action)),
    onPinRequired: () => { log.pinRequests += 1; },
    schedule: (fn, ms) => { log.retries.push({ fn, ms }); return log.retries.length; },
    newId: () => `op${++id}`,
  });
  return { outbox, log, storage };
}

const game = (matchId, gameNo) => ({ matchId, gameNo, result: 'A', timestamp: 'T' });

test('sends ops in order, one at a time, and commits each', async () => {
  const { outbox, log } = setup();
  outbox.enqueue('addPlayer', { name: 'Kari' });
  outbox.enqueue('startNight', { date: DATE, players: [] });
  await outbox.flush();
  assert.deepEqual(log.sent, ['addPlayer', 'startNight']);
  assert.deepEqual(log.committed, ['addPlayer', 'startNight']);
  assert.equal(log.maxConcurrent, 1);
  assert.deepEqual(outbox.pending(), []);
});

test('queue survives a reload via storage', () => {
  const storage = createStorage(memoryBackend());
  const first = setup({ storage, responses: [{ ok: false, error: 'pin' }] });
  first.outbox.enqueue('addPlayer', { name: 'Kari' });
  const second = setup({ storage });
  assert.deepEqual(second.outbox.pending().map((o) => o.action), ['addPlayer']);
});

test('a conflicting startMatch drops its dependent games but keeps unrelated ops', async () => {
  const { outbox, log } = setup({ responses: [{ ok: false, error: 'conflict' }] });
  outbox.enqueue('startMatch', { matchId: `${DATE}#2`, date: DATE });
  outbox.enqueue('addGame', game(`${DATE}#2`, 1));
  outbox.enqueue('addGame', game('2026-09-01#1', 4));
  await outbox.flush();
  assert.deepEqual(log.dropped, [['startMatch', 'addGame']]);
  assert.deepEqual(log.sent, ['startMatch', 'addGame']);
  assert.deepEqual(outbox.pending(), []);
});

test('a conflicting addGame drops later ops on the same match', async () => {
  const { outbox, log } = setup({ responses: [{ ok: false, error: 'conflict' }] });
  outbox.enqueue('addGame', game(`${DATE}#1`, 3));
  outbox.enqueue('addGame', game(`${DATE}#1`, 4));
  outbox.enqueue('deleteGame', { matchId: `${DATE}#1`, gameNo: 4 });
  await outbox.flush();
  assert.deepEqual(log.dropped, [['addGame', 'addGame', 'deleteGame']]);
});

test('a dropped startNight drops every later op for that night', async () => {
  const { outbox, log } = setup({ responses: [{ ok: false, error: 'conflict' }] });
  outbox.enqueue('startNight', { date: DATE, players: [] });
  outbox.enqueue('startMatch', { matchId: `${DATE}#1`, date: DATE });
  outbox.enqueue('addPlayer', { name: 'Kari' });
  await outbox.flush();
  assert.deepEqual(log.dropped, [['startNight', 'startMatch']]);
  assert.deepEqual(log.sent, ['startNight', 'addPlayer']);
});

test('wrong PIN holds the queue until resume', async () => {
  const { outbox, log } = setup({ responses: [{ ok: false, error: 'pin' }] });
  outbox.enqueue('addPlayer', { name: 'Kari' });
  await outbox.flush();
  assert.equal(outbox.isHeld(), true);
  assert.equal(log.pinRequests, 1);
  assert.equal(outbox.pending().length, 1);
  await outbox.resume();
  assert.equal(outbox.isHeld(), false);
  assert.deepEqual(outbox.pending(), []);
});

test('resuming synchronously inside onPinRequired keeps sending', async () => {
  const storage = createStorage(memoryBackend());
  const responses = [{ ok: false, error: 'pin' }];
  let outbox;
  outbox = createOutbox({
    storage,
    send: async () => responses.shift() ?? OK,
    onPinRequired: () => { outbox.resume(); },
    newId: () => 'op1',
  });
  outbox.enqueue('addPlayer', { name: 'Kari' });
  await outbox.flush();
  assert.equal(outbox.isHeld(), false);
  assert.deepEqual(outbox.pending(), []);
});

test('busy and network errors keep the op and schedule a backoff retry', async () => {
  const { outbox, log } = setup({ responses: [{ ok: false, error: 'busy' }, { ok: false, error: 'network' }] });
  outbox.enqueue('addPlayer', { name: 'Kari' });
  await outbox.flush();
  assert.equal(log.retries.length, 1);
  assert.equal(log.retries[0].ms, 1000);
  log.retries[0].fn();
  await outbox.flush();
  assert.equal(log.retries[1].ms, 2000);
  log.retries[1].fn();
  await outbox.flush();
  assert.deepEqual(outbox.pending(), []);
});

test('retract removes a queued op but never the one in flight', async () => {
  const storage = createStorage(memoryBackend());
  let release;
  const outbox = createOutbox({
    storage,
    send: () => new Promise((resolve) => { release = () => resolve(OK); }),
    newId: (() => { let n = 0; return () => `op${++n}`; })(),
  });
  outbox.enqueue('addGame', game(`${DATE}#1`, 1));
  outbox.enqueue('addGame', game(`${DATE}#1`, 2));
  const isGame = (no) => (op) => op.action === 'addGame' && op.payload.gameNo === no;
  assert.equal(outbox.retract(isGame(1)), false);
  assert.equal(outbox.retract(isGame(2)), true);
  release();
  await outbox.flush();
  assert.deepEqual(outbox.pending(), []);
});

test('an op that failed with a network error may have reached the server and is not retractable', async () => {
  const { outbox } = setup({ responses: [{ ok: false, error: 'network' }] });
  outbox.enqueue('addGame', game(`${DATE}#1`, 1));
  await outbox.flush();
  assert.equal(outbox.retract((op) => op.action === 'addGame'), false);
  assert.equal(outbox.pending().length, 1);
});

test('a sent op loaded from storage is not retractable', () => {
  const storage = createStorage(memoryBackend());
  storage.set('outbox', [{ id: 'op1', action: 'addGame', payload: game(`${DATE}#1`, 1), sent: true }]);
  const { outbox } = setup({ storage, responses: [{ ok: false, error: 'pin' }] });
  assert.equal(outbox.retract((op) => op.action === 'addGame'), false);
  assert.equal(outbox.pending()[0].sent, true);
});

test('an exception while handling a response schedules a retry instead of stalling', async () => {
  let failures = 1;
  const { outbox, log } = setup({ onSent: () => { if (failures-- > 0) throw new Error('boom'); } });
  outbox.enqueue('addPlayer', { name: 'Kari' });
  await outbox.flush();
  assert.equal(log.retries.length, 1);
  assert.equal(outbox.pending().length, 1);
  log.retries[0].fn();
  await outbox.flush();
  assert.deepEqual(log.committed, ['addPlayer']);
  assert.deepEqual(outbox.pending(), []);
});

test('a corrupt persisted queue is ignored', () => {
  const storage = createStorage(memoryBackend());
  storage.set('outbox', { not: 'a queue' });
  const { outbox } = setup({ storage });
  assert.deepEqual(outbox.pending(), []);
});

test('enqueue while held does not send until resume', async () => {
  const { outbox, log } = setup({ responses: [{ ok: false, error: 'pin' }] });
  outbox.enqueue('addPlayer', { name: 'Kari' });
  await outbox.flush();
  outbox.enqueue('addPlayer', { name: 'Ola' });
  await outbox.flush();
  assert.equal(log.sent.length, 1);
  assert.equal(outbox.pending().length, 2);
  await outbox.resume();
  assert.deepEqual(log.sent, ['addPlayer', 'addPlayer', 'addPlayer']);
  assert.deepEqual(outbox.pending(), []);
});

test('a dropped deleteMatch drops later ops on the same match', async () => {
  const { outbox, log } = setup({ responses: [{ ok: false, error: 'invalid' }] });
  outbox.enqueue('deleteMatch', { matchId: `${DATE}#1` });
  outbox.enqueue('startMatch', { matchId: `${DATE}#1`, date: DATE });
  outbox.enqueue('addGame', game(`${DATE}#1`, 1));
  outbox.enqueue('addGame', game(`${DATE}#2`, 1));
  await outbox.flush();
  assert.deepEqual(log.dropped, [['deleteMatch', 'startMatch', 'addGame']]);
  assert.deepEqual(log.sent, ['deleteMatch', 'addGame']);
});

test('backoff resets after a success', async () => {
  const { outbox, log } = setup({ responses: [{ ok: false, error: 'network' }, OK, { ok: false, error: 'network' }] });
  outbox.enqueue('addPlayer', { name: 'Kari' });
  await outbox.flush();
  assert.equal(log.retries[0].ms, 1000);
  log.retries[0].fn();
  await outbox.flush();
  assert.deepEqual(outbox.pending(), []);
  outbox.enqueue('addPlayer', { name: 'Ola' });
  await outbox.flush();
  assert.equal(log.retries[1].ms, 1000);
});

test('malformed persisted entries are discarded', () => {
  const storage = createStorage(memoryBackend());
  const valid = { id: 'op1', action: 'addPlayer', payload: { name: 'Kari' } };
  storage.set('outbox', [null, {}, { id: 'op2', action: 'addPlayer', payload: null }, valid]);
  const { outbox } = setup({ storage });
  assert.deepEqual(outbox.pending(), [valid]);
});
