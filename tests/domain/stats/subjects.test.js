import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SUBJECT_TYPES, againstRows, compareSubject, isValidSubject, overallSubject, pairKey, pairRows, pairSubject,
  parsePairKey, playerRows, playerSubject, togetherRows,
} from '../../../docs/js/domain/stats/subjects.js';
import { buildFacts } from '../../../docs/js/domain/stats/facts.js';
import { DATE, dataset, game } from '../../helpers.js';

const M1 = `${DATE}#1`;
const M2 = `${DATE}#2`;
// #1: Hans & Frode vs Tor & Per (2 games); #2: Hans & Tor vs Frode & Per (1 game).
const facts = buildFacts(dataset({
  nights: [{ date: DATE, players: ['Frode', 'Hans', 'Per', 'Tor'] }],
  matches: [
    { matchId: M1, date: DATE, A1: 'Hans', A2: 'Frode', B1: 'Tor', B2: 'Per' },
    { matchId: M2, date: DATE, A1: 'Hans', A2: 'Tor', B1: 'Frode', B2: 'Per' },
  ],
  games: [game(M1, 1, 'A'), game(M1, 2, 'D'), game(M2, 1, 'B')],
}), { kind: 'all' });
const keys = (rows) => rows.map((r) => `${r.player}@${r.matchId}/${r.gameNo}`);

test('subject constructors; pairs are sorted by name', () => {
  assert.deepEqual(SUBJECT_TYPES, ['overall', 'player', 'pair', 'compare']);
  assert.deepEqual(overallSubject(), { type: 'overall' });
  assert.deepEqual(playerSubject('Anne'), { type: 'player', name: 'Anne' });
  assert.deepEqual(pairSubject('Øyvind', 'Bjørn'), { type: 'pair', names: ['Bjørn', 'Øyvind'] });
  assert.deepEqual(compareSubject('Tor', 'Anne'), { type: 'compare', a: 'Tor', b: 'Anne' });
});

test('isValidSubject checks shape', () => {
  assert.equal(isValidSubject(overallSubject()), true);
  assert.equal(isValidSubject(playerSubject('Anne')), true);
  assert.equal(isValidSubject(pairSubject('Anne', 'Bjørn')), true);
  assert.equal(isValidSubject(compareSubject('Anne', 'Bjørn')), true);
  assert.equal(isValidSubject(null), false);
  assert.equal(isValidSubject({ type: 'team' }), false);
  assert.equal(isValidSubject({ type: 'player', name: '' }), false);
  assert.equal(isValidSubject({ type: 'pair', names: ['Anne'] }), false);
  assert.equal(isValidSubject({ type: 'pair', names: ['Bjørn', 'Anne'] }), false);
  assert.equal(isValidSubject({ type: 'compare', a: 'Anne', b: 'Anne' }), false);
});

test('playerRows selects a player\'s rows in order', () => {
  assert.deepEqual(keys(playerRows(facts, 'Hans')), [`Hans@${M1}/1`, `Hans@${M1}/2`, `Hans@${M2}/1`]);
  assert.deepEqual(playerRows(facts, 'Nobody'), []);
});

test('pairRows are the games of a pair from the first partner\'s perspective', () => {
  assert.deepEqual(keys(pairRows(facts, ['Frode', 'Hans'])), [`Frode@${M1}/1`, `Frode@${M1}/2`]);
  assert.deepEqual(pairRows(facts, ['Frode', 'Hans']).map((r) => r.outcome), ['W', 'D']);
  assert.deepEqual(keys(pairRows(facts, ['Frode', 'Per'])), [`Frode@${M2}/1`]);
  assert.deepEqual(pairRows(facts, ['Frode', 'Tor']), []);
});

test('togetherRows and againstRows are head-to-head from a\'s perspective', () => {
  assert.deepEqual(keys(togetherRows(facts, 'Hans', 'Tor')), [`Hans@${M2}/1`]);
  assert.deepEqual(keys(againstRows(facts, 'Hans', 'Tor')), [`Hans@${M1}/1`, `Hans@${M1}/2`]);
  assert.deepEqual(againstRows(facts, 'Tor', 'Hans').map((r) => r.outcome), ['L', 'D']);
  assert.deepEqual(keys(againstRows(facts, 'Hans', 'Frode')), [`Hans@${M2}/1`]);
});

test('pairKey is sorted and parsePairKey reverses it', () => {
  assert.equal(pairKey(['Øyvind', 'Bjørn']), 'Bjørn+Øyvind');
  assert.deepEqual(parsePairKey('Bjørn+Øyvind'), ['Bjørn', 'Øyvind']);
  assert.deepEqual(parsePairKey('Øyvind+Bjørn'), ['Bjørn', 'Øyvind']);
  assert.deepEqual(parsePairKey(pairKey(['Kari Ny', 'Anne'])), ['Anne', 'Kari Ny']);
});

test('parsePairKey rejects malformed keys', () => {
  for (const text of [undefined, '', 'Anne', 'Anne+', '+Anne', 'Anne+Anne', 'A+B+C']) {
    assert.equal(parsePairKey(text), null, String(text));
  }
});
