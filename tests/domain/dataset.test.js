import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOp } from '../../docs/js/domain/dataset.js';
import { DATE, FOUR, MATCH_1, dataset, nightWithMatch } from '../helpers.js';

const op = (action, payload) => ({ action, payload });
const outcome = (ds, action, payload) => applyOp(ds, op(action, payload)).outcome;
const seats = { A1: 'Hans', A2: 'Frode', B1: 'Tor', B2: 'Per' };

test('addPlayer trims, dedupes case-insensitively and rejects bad names', () => {
  const { dataset: ds, outcome: o } = applyOp(dataset(), op('addPlayer', { name: '  Kari ' }));
  assert.equal(o, 'applied');
  assert.deepEqual(ds.players, [{ name: 'Kari', active: true }]);
  assert.equal(outcome(ds, 'addPlayer', { name: 'kari' }), 'noop');
  assert.equal(outcome(ds, 'addPlayer', { name: 'A, B' }), 'invalid');
  assert.equal(outcome(ds, 'addPlayer', { name: ' ' }), 'invalid');
});

test('startNight: applied, noop for same roster in any order, conflict for another roster', () => {
  const { dataset: ds } = applyOp(dataset(), op('startNight', { date: DATE, players: FOUR }));
  assert.equal(ds.nights.length, 1);
  assert.equal(outcome(ds, 'startNight', { date: DATE, players: [...FOUR].reverse() }), 'noop');
  assert.equal(outcome(ds, 'startNight', { date: DATE, players: [...FOUR, 'Kari'] }), 'conflict');
  assert.equal(outcome(dataset(), 'startNight', { date: DATE, players: FOUR.slice(0, 3) }), 'invalid');
});

test('startMatch: applied, noop if identical, conflict if seats differ, invalid seats rejected', () => {
  const base = nightWithMatch();
  const id2 = `${DATE}#2`;
  assert.equal(outcome(base, 'startMatch', { matchId: id2, date: DATE, ...seats }), 'applied');
  assert.equal(outcome(base, 'startMatch', { matchId: MATCH_1, date: DATE, ...seats }), 'noop');
  assert.equal(outcome(base, 'startMatch', { matchId: MATCH_1, date: DATE, ...seats, A2: 'Tor', B1: 'Frode' }), 'conflict');
  assert.equal(outcome(base, 'startMatch', { matchId: id2, date: DATE, ...seats, A2: 'Hans' }), 'invalid');
  assert.equal(outcome(base, 'startMatch', { matchId: 'bad', date: DATE, ...seats }), 'invalid');
});

test('addGame: applied, noop for same result, conflict for different, invalid for unknown match or result', () => {
  const g = { matchId: MATCH_1, gameNo: 1, result: 'D', timestamp: 'T' };
  const { dataset: ds, outcome: o } = applyOp(nightWithMatch(), op('addGame', g));
  assert.equal(o, 'applied');
  assert.equal(outcome(ds, 'addGame', g), 'noop');
  assert.equal(outcome(ds, 'addGame', { ...g, result: 'A' }), 'conflict');
  assert.equal(outcome(ds, 'addGame', { ...g, matchId: `${DATE}#9` }), 'invalid');
  assert.equal(outcome(ds, 'addGame', { ...g, gameNo: 2, result: 'X' }), 'invalid');
});

test('deleteGame removes the game or is a noop', () => {
  const ds = nightWithMatch(['A', 'B']);
  const { dataset: after, outcome: o } = applyOp(ds, op('deleteGame', { matchId: MATCH_1, gameNo: 2 }));
  assert.equal(o, 'applied');
  assert.deepEqual(after.games.map((g) => g.gameNo), [1]);
  assert.equal(outcome(after, 'deleteGame', { matchId: MATCH_1, gameNo: 2 }), 'noop');
});

test('deleteMatch only for matches without games', () => {
  assert.equal(outcome(nightWithMatch(['A']), 'deleteMatch', { matchId: MATCH_1 }), 'invalid');
  assert.equal(outcome(nightWithMatch(), 'deleteMatch', { matchId: MATCH_1 }), 'applied');
  assert.equal(outcome(nightWithMatch(), 'deleteMatch', { matchId: `${DATE}#7` }), 'noop');
});

test('unknown actions are invalid and input is never mutated', () => {
  const ds = nightWithMatch(['A']);
  const snapshot = structuredClone(ds);
  assert.equal(outcome(ds, 'dropTable', {}), 'invalid');
  applyOp(ds, op('addGame', { matchId: MATCH_1, gameNo: 2, result: 'B', timestamp: 'T' }));
  applyOp(ds, op('deleteGame', { matchId: MATCH_1, gameNo: 1 }));
  assert.deepEqual(ds, snapshot);
});
