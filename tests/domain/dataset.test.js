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
  assert.equal(outcome(ds, 'addPlayer', { name: 'A+B' }), 'invalid');
  assert.equal(outcome(ds, 'addPlayer', { name: ' ' }), 'invalid');
});

test('startNight: applied, noop for same roster in any order, conflict for another roster', () => {
  const { dataset: ds } = applyOp(dataset(), op('startNight', { date: DATE, players: FOUR }));
  assert.equal(ds.nights.length, 1);
  assert.equal(ds.nights[0].summarySent, '', 'a new night has no summary sent');
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

test('startMatch: a payload without A3/B3 is a 2 vs 2 match stored with empty third seats', () => {
  const { dataset: ds, outcome: o } = applyOp(nightWithMatch(), op('startMatch', { matchId: `${DATE}#2`, date: DATE, ...seats }));
  assert.equal(o, 'applied');
  assert.deepEqual(ds.matches.at(-1), { matchId: `${DATE}#2`, date: DATE, ...seats, A3: '', B3: '' });
  assert.equal(outcome(ds, 'startMatch', { matchId: `${DATE}#2`, date: DATE, ...seats, A3: '', B3: '' }), 'noop');
});

test('startMatch: teams of three', () => {
  const base = { ...nightWithMatch(), nights: [{ date: DATE, players: [...FOUR, 'Kari', 'Ola'] }] };
  const three = { matchId: `${DATE}#2`, date: DATE, ...seats, A3: 'Kari' };
  const { dataset: ds, outcome: o } = applyOp(base, op('startMatch', three));
  assert.equal(o, 'applied');
  assert.deepEqual(ds.matches.at(-1), { ...three, B3: '' });
  assert.equal(outcome(ds, 'startMatch', three), 'noop');
  assert.equal(outcome(ds, 'startMatch', { ...three, A3: '' }), 'conflict');
  assert.equal(outcome(ds, 'startMatch', { ...three, B3: 'Ola' }), 'conflict');
  assert.equal(outcome(base, 'startMatch', { ...three, B3: 'Ola' }), 'applied');
  assert.equal(outcome(base, 'startMatch', { ...three, B3: 'Kari' }), 'invalid');
  assert.equal(outcome(base, 'startMatch', { ...three, A3: 'Tor' }), 'invalid');
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

test('a missing payload returns invalid instead of throwing', () => {
  for (const action of ['addPlayer', 'startNight', 'startMatch', 'addGame', 'deleteGame', 'deleteMatch']) {
    assert.notEqual(applyOp(nightWithMatch(), { action }).outcome, 'applied', action);
  }
  for (const action of ['addPlayer', 'startNight', 'startMatch', 'addGame']) {
    assert.equal(applyOp(nightWithMatch(), { action }).outcome, 'invalid', action);
  }
});

test('addPlayer rejects a non-string name', () => {
  assert.equal(outcome(dataset(), 'addPlayer', { name: 42 }), 'invalid');
  assert.equal(outcome(dataset(), 'addPlayer', { name: ['Kari'] }), 'invalid');
});

test('startNight rejects players that are not an array', () => {
  assert.equal(outcome(dataset(), 'startNight', { date: DATE, players: 'Hans,Per,Frode,Tor' }), 'invalid');
  assert.equal(outcome(dataset(), 'startNight', { date: DATE }), 'invalid');
});

test('startMatch rejects a date that differs from the match id', () => {
  assert.equal(outcome(nightWithMatch(), 'startMatch', { matchId: `${DATE}#2`, date: '2026-10-15', ...seats }), 'invalid');
});

test('addGame rejects a game number that is not a positive integer', () => {
  const g = { matchId: MATCH_1, result: 'A', timestamp: 'T' };
  for (const gameNo of [0, -1, 1.5, '1', undefined]) {
    assert.equal(outcome(nightWithMatch(), 'addGame', { ...g, gameNo }), 'invalid', String(gameNo));
  }
});

test('a non-object op is invalid instead of throwing', () => {
  assert.equal(applyOp(nightWithMatch(), null).outcome, 'invalid');
  assert.equal(applyOp(nightWithMatch(), 'startMatch').outcome, 'invalid');
});

test('a non-string matchId never throws', () => {
  for (const matchId of [[MATCH_1], 42, { toString: () => MATCH_1 }]) {
    assert.equal(outcome(nightWithMatch(), 'startMatch', { matchId, date: DATE, ...seats }), 'invalid');
    assert.equal(outcome(nightWithMatch(), 'addGame', { matchId, gameNo: 1, result: 'A', timestamp: 'T' }), 'invalid');
    assert.equal(outcome(nightWithMatch(['A']), 'deleteGame', { matchId, gameNo: 1 }), 'noop');
    assert.equal(outcome(nightWithMatch(), 'deleteMatch', { matchId }), 'noop');
  }
});

// ---------- Player management ----------

const withKari = () => ({ ...nightWithMatch(['A']), players: [...nightWithMatch().players, { name: 'Kari', active: true }] });

test('renamePlayer renames the player, every roster and every seat', () => {
  const { dataset: ds, outcome: o } = applyOp(withKari(), op('renamePlayer', { from: 'Hans', to: ' Johannes ' }));
  assert.equal(o, 'applied');
  assert.deepEqual(ds.players.map((p) => p.name), ['Frode', 'Johannes', 'Per', 'Tor', 'Kari']);
  assert.deepEqual(ds.nights[0].players, ['Frode', 'Johannes', 'Per', 'Tor']);
  assert.equal(ds.matches[0].A1, 'Johannes');
  assert.deepEqual(ds.games, withKari().games);
});

test('renamePlayer keeps the active flag', () => {
  const base = dataset({ players: [{ name: 'Gamle', active: false }] });
  assert.deepEqual(applyOp(base, op('renamePlayer', { from: 'Gamle', to: 'Eldre' })).dataset.players, [{ name: 'Eldre', active: false }]);
});

test('renamePlayer to another casing of the same player is applied', () => {
  const { dataset: ds, outcome: o } = applyOp(withKari(), op('renamePlayer', { from: 'Hans', to: 'HANS' }));
  assert.equal(o, 'applied');
  assert.equal(ds.matches[0].A1, 'HANS');
  assert.deepEqual(ds.nights[0].players, ['Frode', 'HANS', 'Per', 'Tor']);
  // Retrying the same op is a noop: 'Hans' now resolves to 'HANS', which already is the target.
  assert.equal(outcome(ds, 'renamePlayer', { from: 'Hans', to: 'HANS' }), 'noop');
});

test('renamePlayer is idempotent: a retry after success is a noop', () => {
  const rename = { from: 'Hans', to: 'Johannes' };
  const { dataset: ds } = applyOp(withKari(), op('renamePlayer', rename));
  assert.equal(outcome(ds, 'renamePlayer', rename), 'noop');
  assert.equal(outcome(ds, 'renamePlayer', { from: 'Hans', to: 'johannes' }), 'noop');
});

test('renamePlayer: noop for the same name, conflict for another player, invalid otherwise', () => {
  assert.equal(outcome(withKari(), 'renamePlayer', { from: 'Hans', to: 'Hans' }), 'noop');
  assert.equal(outcome(withKari(), 'renamePlayer', { from: 'Hans', to: 'kari' }), 'conflict');
  assert.equal(outcome(withKari(), 'renamePlayer', { from: 'Nobody', to: 'Someone' }), 'invalid');
  for (const to of ['', '  ', 'A, B', 'A+B', 42, null]) {
    assert.equal(outcome(withKari(), 'renamePlayer', { from: 'Hans', to }), 'invalid', String(to));
  }
  assert.equal(outcome(withKari(), 'renamePlayer', { from: 42, to: 'Johannes' }), 'invalid');
  assert.equal(outcome(withKari(), 'renamePlayer', {}), 'invalid');
});

test('setPlayerActive: applied, noop for the same value, invalid for unknown player or non-boolean', () => {
  const { dataset: ds, outcome: o } = applyOp(withKari(), op('setPlayerActive', { name: 'Kari', active: false }));
  assert.equal(o, 'applied');
  assert.deepEqual(ds.players.at(-1), { name: 'Kari', active: false });
  assert.equal(outcome(ds, 'setPlayerActive', { name: 'Kari', active: false }), 'noop');
  assert.equal(outcome(ds, 'setPlayerActive', { name: 'kari', active: true }), 'applied');
  assert.equal(outcome(ds, 'setPlayerActive', { name: 'Nobody', active: false }), 'invalid');
  assert.equal(outcome(ds, 'setPlayerActive', { name: 'Kari', active: 'false' }), 'invalid');
  assert.equal(outcome(ds, 'setPlayerActive', { name: 42, active: true }), 'invalid');
});

test('deletePlayer: only players without history; noop if absent', () => {
  const { dataset: ds, outcome: o } = applyOp(withKari(), op('deletePlayer', { name: 'kari' }));
  assert.equal(o, 'applied');
  assert.deepEqual(ds.players.map((p) => p.name), FOUR);
  assert.equal(outcome(ds, 'deletePlayer', { name: 'Kari' }), 'noop');
  assert.equal(outcome(withKari(), 'deletePlayer', { name: 'Hans' }), 'invalid');
  assert.equal(outcome(withKari(), 'deletePlayer', { name: 42 }), 'invalid');
});

test('renamePlayer rewrites third seats too and leaves empty seats alone', () => {
  const base = withKari();
  base.matches = [...base.matches, { matchId: `${DATE}#2`, date: DATE, A1: 'Hans', A2: 'Frode', A3: 'Kari', B1: 'Tor', B2: 'Per', B3: '' }];
  const { dataset: ds } = applyOp(base, op('renamePlayer', { from: 'Kari', to: 'Karianne' }));
  assert.deepEqual(ds.matches[1], { ...base.matches[1], A3: 'Karianne' });
  assert.deepEqual(ds.matches[0], base.matches[0]);
  assert.equal(Object.hasOwn(ds.matches[0], 'A3'), false);
});

test('deletePlayer refuses a player who only sat in a third seat', () => {
  const base = withKari();
  base.matches = [{ matchId: `${DATE}#2`, date: DATE, A1: 'Hans', A2: 'Frode', A3: '', B1: 'Tor', B2: 'Per', B3: 'Kari' }];
  base.nights = [];
  assert.equal(outcome(base, 'deletePlayer', { name: 'Kari' }), 'invalid');
});

test('deletePlayer refuses a player who is only on a night roster', () => {
  const base = dataset({ players: FOUR.map((name) => ({ name, active: true })), nights: [{ date: DATE, players: FOUR }] });
  assert.equal(outcome(base, 'deletePlayer', { name: 'Tor' }), 'invalid');
});

test('player ops never mutate their input', () => {
  const ds = withKari();
  const snapshot = structuredClone(ds);
  applyOp(ds, op('renamePlayer', { from: 'Hans', to: 'Johannes' }));
  applyOp(ds, op('setPlayerActive', { name: 'Hans', active: false }));
  applyOp(ds, op('deletePlayer', { name: 'Kari' }));
  assert.deepEqual(ds, snapshot);
});

test('player ops with a missing payload do not throw', () => {
  for (const action of ['renamePlayer', 'setPlayerActive', 'deletePlayer']) {
    assert.equal(applyOp(withKari(), { action }).outcome, 'invalid', action);
  }
});

// ---------- Joining and leaving a night ----------

const nightOf = (ds) => ds.nights.find((n) => n.date === DATE);

test('startNight stores an empty left list and no summary sent', () => {
  const { dataset: ds } = applyOp(dataset(), op('startNight', { date: DATE, players: FOUR }));
  assert.deepEqual(nightOf(ds), { date: DATE, players: FOUR, left: [], summarySent: '' });
});

test('joinNight appends an existing player to the roster under the stored name', () => {
  const { dataset: ds, outcome: o } = applyOp(withKari(), op('joinNight', { date: DATE, name: ' kari ' }));
  assert.equal(o, 'applied');
  assert.deepEqual(nightOf(ds).players, [...FOUR, 'Kari']);
  assert.equal(outcome(ds, 'joinNight', { date: DATE, name: 'Kari' }), 'noop', 'a retry is a noop');
  assert.equal(outcome(withKari(), 'joinNight', { date: DATE, name: 'Hans' }), 'noop', 'already here');
});

test('joinNight is invalid without such a night or such a player', () => {
  assert.equal(outcome(withKari(), 'joinNight', { date: '2026-10-15', name: 'Kari' }), 'invalid');
  assert.equal(outcome(withKari(), 'joinNight', { date: DATE, name: 'Ukjent' }), 'invalid');
  assert.equal(outcome(withKari(), 'joinNight', { date: DATE, name: 42 }), 'invalid');
  assert.equal(outcome(withKari(), 'joinNight', {}), 'invalid');
  assert.equal(applyOp(withKari(), { action: 'joinNight' }).outcome, 'invalid');
});

test('leaveNight marks a roster player as gone home; joinNight brings them back', () => {
  const { dataset: gone, outcome: o } = applyOp(withKari(), op('leaveNight', { date: DATE, name: 'per' }));
  assert.equal(o, 'applied');
  assert.deepEqual(nightOf(gone).players, FOUR, 'attendance keeps everyone who was there');
  assert.deepEqual(nightOf(gone).left, ['Per']);
  assert.equal(outcome(gone, 'leaveNight', { date: DATE, name: 'Per' }), 'noop', 'a retry is a noop');

  const { dataset: back, outcome: again } = applyOp(gone, op('joinNight', { date: DATE, name: 'Per' }));
  assert.equal(again, 'applied');
  assert.deepEqual(nightOf(back), { date: DATE, players: FOUR, left: [] });
});

test('leaveNight is invalid for a player who is not on the roster, or without such a night', () => {
  assert.equal(outcome(withKari(), 'leaveNight', { date: DATE, name: 'Kari' }), 'invalid');
  assert.equal(outcome(withKari(), 'leaveNight', { date: DATE, name: 'Ukjent' }), 'invalid');
  assert.equal(outcome(withKari(), 'leaveNight', { date: '2026-10-15', name: 'Hans' }), 'invalid');
  assert.equal(outcome(withKari(), 'leaveNight', {}), 'invalid');
  assert.equal(applyOp(withKari(), { action: 'leaveNight' }).outcome, 'invalid');
});

test('joinNight and leaveNight do not mutate the input', () => {
  const ds = withKari();
  const snapshot = structuredClone(ds);
  applyOp(ds, op('joinNight', { date: DATE, name: 'Kari' }));
  applyOp(ds, op('leaveNight', { date: DATE, name: 'Hans' }));
  assert.deepEqual(ds, snapshot);
});

test('renamePlayer also renames the player in the left list', () => {
  const { dataset: gone } = applyOp(withKari(), op('leaveNight', { date: DATE, name: 'Hans' }));
  const { dataset: ds } = applyOp(gone, op('renamePlayer', { from: 'Hans', to: 'Johannes' }));
  assert.deepEqual(nightOf(ds).left, ['Johannes']);
});
