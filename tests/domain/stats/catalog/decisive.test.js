import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nightFilter } from '../../../../docs/js/domain/stats/filter.js';
import { overallSubject, playerSubject } from '../../../../docs/js/domain/stats/subjects.js';
import { HF_TP, HP_FT, HT_FP, compute, factsOf } from './fixtures.js';

const OVERALL = overallSubject();
const N1 = '2026-09-02';
const N2 = '2026-09-16';

// Deciding games (a team at 2 wins before the game), with Hans / Frode / Tor / Per:
// N1 #1 'AADA': games 3 (D) and 4 (A win). #2 'BBDB': games 3 (D) and 4 (B win). #3 'ABAB': game 4 (B win).
// N2 #1 'DDA': none. #2 'AAA' Tor & Per beat Frode & Ola: game 3.
const NIGHTS = [
  { date: N1, matches: [[HF_TP, 'AADA'], [HT_FP, 'BBDB'], [HP_FT, 'ABAB']] },
  { date: N2, matches: [[HF_TP, 'DDA'], ['Tor Per - Frode Ola', 'AAA']] },
];
const FACTS = factsOf(NIGHTS);

test('decisiveWinRate: win share in deciding games, at least MIN_DECISIVE_GAMES of them', () => {
  // Hans: D W | D L | L → 1 of 5.
  assert.deepEqual(compute('decisiveWinRate', FACTS, playerSubject('Hans')), { value: 1 / 5, format: 'percent' });
  // Frode: D W | D W | W | L → 3 of 6.
  assert.deepEqual(compute('decisiveWinRate', FACTS, playerSubject('Frode')), { value: 3 / 6, format: 'percent' });
  assert.equal(compute('decisiveWinRate', FACTS, playerSubject('Ola')), null, 'one deciding game is too few');
  assert.equal(compute('decisiveWinRate', FACTS, playerSubject('Nobody')), null);
});

test('decisiveWinRate: on a night page one deciding game is enough', () => {
  const night = factsOf(NIGHTS, nightFilter(N2));
  assert.deepEqual(compute('decisiveWinRate', night, playerSubject('Ola')), { value: 0, format: 'percent' });
  assert.equal(compute('decisiveWinRate', night, playerSubject('Hans')), null, 'no deciding game that night');
});

test('decisiveTable: players with enough deciding games, by win share, then games, then name', () => {
  const value = compute('decisiveTable', FACTS, OVERALL);
  assert.deepEqual(value.columns.map((c) => [c.key, c.format]), [
    ['player', 'player'], ['games', 'int'], ['W', 'int'], ['D', 'int'], ['L', 'int'], ['winRate', 'percent'],
  ]);
  assert.deepEqual(value.rows.map(({ player, games, W, D, L }) => [player, games, W, D, L]), [
    ['Frode', 6, 3, 2, 1],
    ['Per', 6, 2, 2, 2],
    ['Tor', 6, 2, 2, 2],
    ['Hans', 5, 1, 2, 2],
  ], 'Ola has one deciding game');
  assert.equal(value.rows[0].winRate, 0.5);
  assert.deepEqual(value.rows[0].subject, playerSubject('Frode'));
});

test('decisiveTable: more games wins a tie on win share', () => {
  // Hans & Frode: 'AAA' and 'AAA' → 2 deciding games, both won; Tor & Per: 1 of those plus none.
  const facts = factsOf([{ date: N1, matches: [[HF_TP, 'AAA'], ['Hans Ola - Tor Per', 'AAA']] }], nightFilter(N1));
  assert.deepEqual(compute('decisiveTable', facts, OVERALL).rows.map((r) => [r.player, r.games, r.winRate]), [
    ['Hans', 2, 1], ['Frode', 1, 1], ['Ola', 1, 1], ['Per', 2, 0], ['Tor', 2, 0],
  ]);
});

test('decisiveTable: null when nobody has enough deciding games', () => {
  assert.equal(compute('decisiveTable', factsOf([{ date: N1, matches: [[HF_TP, 'AAA']] }]), OVERALL), null);
  assert.equal(compute('decisiveTable', factsOf([{ date: N1, matches: [[HF_TP, 'DDA']] }], nightFilter(N1)), OVERALL), null);
});
