import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  allTimeGameNumbers, decidingFlags, decidingRows, minGamesFor, runOf, settledRows,
} from '../../../docs/js/domain/stats/aggregate.js';
import { MIN_DECISIVE_GAMES, MIN_GAMES_TOGETHER } from '../../../docs/js/domain/stats/constants.js';
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

test('runOf: current and longest run of the given outcomes; end = last row of the most recent longest run', () => {
  const rows = [...'WWDWWLW'].map((outcome, index) => ({ outcome, index }));
  assert.deepEqual(runOf(rows, ['W']), { current: 1, longest: 2, end: rows[4] });
  assert.deepEqual(runOf(rows, ['W', 'D']), { current: 1, longest: 5, end: rows[4] });
  assert.deepEqual(runOf(rows.slice(0, 2), ['L']), { current: 0, longest: 0, end: null });
});

test('minGamesFor: no minimum for a single night, MIN_GAMES_TOGETHER otherwise', () => {
  assert.equal(minGamesFor({ kind: 'night', date: '2026-10-13' }), 1);
  assert.equal(minGamesFor({ kind: 'all' }), MIN_GAMES_TOGETHER);
  assert.equal(minGamesFor({ kind: 'season', year: 2026, half: 2 }), MIN_GAMES_TOGETHER);
});

test('minGamesFor: a stat may pass its own minimum; a night still needs only one game', () => {
  assert.equal(minGamesFor({ kind: 'all' }, MIN_DECISIVE_GAMES), MIN_DECISIVE_GAMES);
  assert.equal(minGamesFor({ kind: 'season', year: 2026, half: 2 }, MIN_DECISIVE_GAMES), MIN_DECISIVE_GAMES);
  assert.equal(minGamesFor({ kind: 'night', date: '2026-10-13' }, MIN_DECISIVE_GAMES), 1);
});

const games = (results) => [...results].map((result) => ({ result }));

test('decidingFlags: a game is deciding when a team stands at 2 wins before it; draws keep the state', () => {
  assert.deepEqual(decidingFlags(games('AAA')), [false, false, true]);
  assert.deepEqual(decidingFlags(games('AADA')), [false, false, true, true], '2–0, a draw, still 2–0');
  assert.deepEqual(decidingFlags(games('BBDB')), [false, false, true, true], '0–2');
  assert.deepEqual(decidingFlags(games('ABAB')), [false, false, false, true], '2–1 before the last');
  assert.deepEqual(decidingFlags(games('ABBADDA')), [false, false, false, true, true, true, true], '1–2, then 2–2 with draws');
  assert.deepEqual(decidingFlags(games('DDA')), [false, false, false]);
  assert.deepEqual(decidingFlags([]), []);
});

test('decidingRows: the rows of deciding games, every player of both teams, canonical order', () => {
  const facts = factsOf([{ date: N1, matches: [[HF_TP, 'ABAB'], [HF_TP, 'AA']] }]);
  const rows = decidingRows(facts);
  assert.deepEqual(rows.map((r) => [r.player, r.matchId, r.gameNo, r.outcome]), [
    ['Hans', `${N1}#1`, 4, 'L'], ['Frode', `${N1}#1`, 4, 'L'], ['Tor', `${N1}#1`, 4, 'W'], ['Per', `${N1}#1`, 4, 'W'],
  ]);
});
