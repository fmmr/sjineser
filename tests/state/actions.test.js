import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createActions } from '../../docs/js/state/actions.js';
import { createStore } from '../../docs/js/state/store.js';
import { createStorage } from '../../docs/js/state/storage.js';
import { DATE, FOUR, MATCH_1, dataset, memoryBackend, nightWithMatch } from '../helpers.js';

/** Minimal outbox with the same retract semantics as the real one, plus manual sent marking. */
function fakeOutbox() {
  let n = 0;
  const box = {
    queue: [],
    onChange: () => {},
    enqueue(action, payload) {
      const op = { id: `op${++n}`, action, payload };
      box.queue.push(op);
      box.onChange();
      return op;
    },
    retract(predicate) {
      const op = box.queue.findLast((o) => !o.sent && predicate(o));
      if (!op) return false;
      box.queue = box.queue.filter((o) => o !== op);
      box.onChange();
      return true;
    },
    pending: () => box.queue,
    markSent: (op) => { op.sent = true; },
  };
  return box;
}

function setup(base = dataset()) {
  const storage = createStorage(memoryBackend());
  storage.set('dataset', base);
  const outbox = fakeOutbox();
  const store = createStore({ storage, outbox, api: { getAll: async () => ({ ok: false }) } });
  outbox.onChange = () => store.recompute();
  const actions = createActions({ store, outbox, today: () => DATE, now: () => 'T' });
  return { actions, outbox, store };
}

const queued = (outbox) => outbox.queue.map((op) => `${op.action} ${op.payload.matchId ?? op.payload.name ?? op.payload.date}${op.payload.gameNo ? `/${op.payload.gameNo}` : ''}`);
const seats = { A1: 'Hans', A2: 'Per', B1: 'Frode', B2: 'Tor' };

test('addPlayer validates and enqueues the trimmed name', () => {
  const { actions, outbox } = setup(nightWithMatch());
  assert.deepEqual(actions.addPlayer('hans'), { ok: false, error: 'duplicate' });
  assert.deepEqual(actions.addPlayer(' Kari '), { ok: true });
  assert.deepEqual(queued(outbox), ['addPlayer Kari']);
});

test('startNight uses today and rejects fewer than four players', () => {
  const { actions, outbox } = setup();
  assert.deepEqual(actions.startNight(FOUR.slice(0, 3)), { ok: false, error: 'invalid' });
  assert.deepEqual(actions.startNight(FOUR), { ok: true });
  assert.deepEqual(queued(outbox), [`startNight ${DATE}`]);
});

test('startMatch needs a night and numbers matches within it', () => {
  assert.deepEqual(setup().actions.startMatch(seats), { ok: false, error: 'noNight' });
  const { actions, outbox, store } = setup(nightWithMatch(['A', 'A', 'A']));
  actions.startMatch(seats);
  assert.deepEqual(queued(outbox), [`startMatch ${DATE}#2`]);
  assert.equal(store.get().matches.length, 2);
});

test('starting a new match replaces an empty unsent match', () => {
  const { actions, outbox } = setup({ ...nightWithMatch(), matches: [] });
  actions.startMatch({ A1: 'Hans', A2: 'Frode', B1: 'Tor', B2: 'Per' });
  actions.startMatch(seats);
  assert.equal(outbox.queue.length, 1);
  assert.equal(outbox.queue[0].payload.matchId, `${DATE}#1`);
  assert.equal(outbox.queue[0].payload.A2, 'Per');
});

test('starting a new match deletes an empty synced match and takes the next number', () => {
  const { actions, outbox } = setup(nightWithMatch());
  actions.startMatch(seats);
  assert.deepEqual(queued(outbox), [`deleteMatch ${MATCH_1}`, `startMatch ${DATE}#2`]);
});

test('starting a new match keeps an abandoned match that has games', () => {
  const { actions, outbox } = setup(nightWithMatch(['A', 'D']));
  actions.startMatch(seats);
  assert.deepEqual(queued(outbox), [`startMatch ${DATE}#2`]);
});

test('invalid seats are rejected without side effects', () => {
  const { actions, outbox } = setup(nightWithMatch());
  assert.deepEqual(actions.startMatch({ ...seats, A2: 'Hans' }), { ok: false, error: 'invalid' });
  assert.deepEqual(outbox.queue, []);
});

test('recordGame numbers games and stops when the match is complete', () => {
  const { actions, outbox } = setup(nightWithMatch(['A', 'A']));
  actions.recordGame('D');
  actions.recordGame('A');
  assert.deepEqual(queued(outbox), [`addGame ${MATCH_1}/3`, `addGame ${MATCH_1}/4`]);
  assert.deepEqual(actions.recordGame('B'), { ok: false, error: 'noMatch' });
});

test('undo retracts an unsent game', () => {
  const { actions, outbox, store } = setup(nightWithMatch());
  actions.recordGame('A');
  actions.undo();
  assert.deepEqual(outbox.queue, []);
  assert.equal(store.get().games.length, 0);
});

test('undo of a sent game enqueues deleteGame', () => {
  const { actions, outbox, store } = setup(nightWithMatch());
  actions.recordGame('A');
  outbox.markSent(outbox.queue[0]);
  actions.undo();
  assert.deepEqual(queued(outbox), [`addGame ${MATCH_1}/1`, `deleteGame ${MATCH_1}/1`]);
  assert.equal(store.get().games.length, 0);
});

test('undo works on a just-completed match', () => {
  const { actions, outbox, store } = setup(nightWithMatch(['A', 'A', 'A']));
  actions.undo();
  assert.deepEqual(queued(outbox), [`deleteGame ${MATCH_1}/3`]);
  assert.equal(store.get().games.length, 2);
});

test('undo with no games removes the match', () => {
  const { actions, outbox } = setup(nightWithMatch());
  actions.undo();
  assert.deepEqual(queued(outbox), [`deleteMatch ${MATCH_1}`]);
  assert.deepEqual(setup().actions.undo(), { ok: false, error: 'nothingToUndo' });
});

test('an empty match whose startMatch was sent is deleted and its number not reused', () => {
  const { actions, outbox } = setup({ ...nightWithMatch(), matches: [] });
  actions.startMatch({ A1: 'Hans', A2: 'Frode', B1: 'Tor', B2: 'Per' });
  outbox.markSent(outbox.queue[0]);
  actions.startMatch(seats);
  assert.deepEqual(queued(outbox), [`startMatch ${MATCH_1}`, `deleteMatch ${MATCH_1}`, `startMatch ${DATE}#2`]);
});

test('a number whose deleteMatch is still queued is not reused', () => {
  const { actions, outbox } = setup({ ...nightWithMatch(), matches: [] });
  actions.startMatch({ A1: 'Hans', A2: 'Frode', B1: 'Tor', B2: 'Per' });
  outbox.markSent(outbox.queue[0]);
  actions.undo();
  actions.startMatch(seats);
  assert.deepEqual(queued(outbox), [`startMatch ${MATCH_1}`, `deleteMatch ${MATCH_1}`, `startMatch ${DATE}#2`]);
});
