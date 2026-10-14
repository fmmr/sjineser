import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overallSubject, pairSubject } from '../../../../docs/js/domain/stats/subjects.js';
import { HF_TP, compute, factsOf } from './fixtures.js';

const N1 = '2026-09-02';
const PAIR = pairSubject('Hans', 'Frode');
const NONE = pairSubject('Hans', 'Ola');

// Frode & Hans: #1 W W W (won) vs Tor & Per; #2 D L D L L (lost) vs Ola & Per; #3 W W (unfinished) vs Tor & Per.
const FACTS = factsOf([{ date: N1, matches: [[HF_TP, 'AAA'], ['Frode Hans - Ola Per', 'DBDBB'], ['Tor Per - Hans Frode', 'BB']] }]);

const COLUMNS = [
  { key: 'pair', format: 'pair' }, { key: 'games', format: 'int' },
  { key: 'W', format: 'int' }, { key: 'D', format: 'int' }, { key: 'L', format: 'int' },
  { key: 'winRate', format: 'percent' },
];

test('pair results: games, win rate, finished matches, draw rate', () => {
  assert.deepEqual(compute('gamesWdl', FACTS, PAIR), { W: 5, D: 2, L: 3 });
  assert.deepEqual(compute('gameWinRate', FACTS, PAIR), { value: 0.5, format: 'percent' });
  assert.deepEqual(compute('matchesWdl', FACTS, PAIR), { W: 1, D: 0, L: 1 });
  assert.deepEqual(compute('matchWinRate', FACTS, PAIR), { value: 0.5, format: 'percent' });
  assert.deepEqual(compute('drawRate', FACTS, PAIR), { value: 0.2, format: 'percent' });
});

test('pair results are null for a pair that never played together', () => {
  for (const id of ['gamesWdl', 'gameWinRate', 'matchesWdl', 'matchWinRate', 'drawRate', 'pairVsPairs']) {
    assert.equal(compute(id, FACTS, NONE), null, id);
  }
});

test('pairVsPairs: per opposing pair from the subject pair’s perspective', () => {
  assert.deepEqual(compute('pairVsPairs', FACTS, PAIR), { columns: COLUMNS, rows: [
    { pair: ['Ola', 'Per'], games: 5, W: 0, D: 2, L: 3, winRate: 0, subject: pairSubject('Ola', 'Per') },
    { pair: ['Per', 'Tor'], games: 5, W: 5, D: 0, L: 0, winRate: 1, subject: pairSubject('Per', 'Tor') },
  ] });
});

test('pairsTable: every pair with games, most games first; row subject = pair', () => {
  assert.deepEqual(compute('pairsTable', FACTS, overallSubject()), { columns: COLUMNS, rows: [
    { pair: ['Frode', 'Hans'], games: 10, W: 5, D: 2, L: 3, winRate: 0.5, subject: PAIR },
    { pair: ['Ola', 'Per'], games: 5, W: 3, D: 2, L: 0, winRate: 0.6, subject: pairSubject('Ola', 'Per') },
    { pair: ['Per', 'Tor'], games: 5, W: 0, D: 0, L: 5, winRate: 0, subject: pairSubject('Per', 'Tor') },
  ] });
  assert.equal(compute('pairsTable', factsOf([]), overallSubject()), null);
});
