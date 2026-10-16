import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allTimeGameNumbers, minGamesFor, settledRows } from '../../../docs/js/domain/stats/aggregate.js';
import { MIN_GAMES_TOGETHER } from '../../../docs/js/domain/stats/constants.js';
import { HF_TP, factsOf } from './catalog/fixtures.js';

const SPRING = '2026-03-04';
const N1 = '2026-09-02';
const AUTUMN = { kind: 'season', year: 2026, half: 2 };

// Hans, Frode, Tor and Per play 3 games in spring; Ola joins in autumn.
const NIGHTS = [
  { date: SPRING, matches: [[HF_TP, 'AAA']] },
  { date: N1, matches: [[HF_TP, 'BB'], ['Hans Frode - Tor Ola', 'A']] },
];

test('allTimeGameNumbers: per row, the player\'s game number counted over all games ever', () => {
  const facts = factsOf(NIGHTS, AUTUMN);
  const numbers = allTimeGameNumbers(facts);
  assert.deepEqual(facts.rows.map((r) => [r.player, numbers.get(r)]), [
    ['Hans', 4], ['Frode', 4], ['Tor', 4], ['Per', 4],
    ['Hans', 5], ['Frode', 5], ['Tor', 5], ['Per', 5],
    ['Hans', 6], ['Frode', 6], ['Tor', 6], ['Ola', 1],
  ]);
});

test('settledRows: only rows after the player\'s PROVISIONAL_GAMES-th game ever', () => {
  // 8 games in spring: game 10 is the second game of the autumn night; Ola has 1 game.
  const nights = [{ date: SPRING, matches: [[HF_TP, 'AAA'], [HF_TP, 'BBB'], [HF_TP, 'AA']] },
    { date: N1, matches: [[HF_TP, 'AB'], ['Hans Frode - Tor Ola', 'A']] }];
  assert.deepEqual(settledRows(factsOf(nights)).map((r) => [r.player, r.date, r.gameNo]), [
    ['Hans', N1, 2], ['Frode', N1, 2], ['Tor', N1, 2], ['Per', N1, 2],
    ['Hans', N1, 1], ['Frode', N1, 1], ['Tor', N1, 1],
  ]);
  assert.equal(settledRows(factsOf(nights, { kind: 'season', year: 2026, half: 1 })).length, 0);
});

test('minGamesFor: no minimum for a single night, MIN_GAMES_TOGETHER otherwise', () => {
  assert.equal(minGamesFor({ kind: 'night', date: '2026-10-13' }), 1);
  assert.equal(minGamesFor({ kind: 'all' }), MIN_GAMES_TOGETHER);
  assert.equal(minGamesFor({ kind: 'season', year: 2026, half: 2 }), MIN_GAMES_TOGETHER);
});
