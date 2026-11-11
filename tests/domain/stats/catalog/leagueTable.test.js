import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEAGUE_POINTS_NIGHT, LEAGUE_POINTS_SET_WON } from '../../../../docs/js/domain/stats/constants.js';
import { nightFilter } from '../../../../docs/js/domain/stats/filter.js';
import { overallSubject, playerSubject } from '../../../../docs/js/domain/stats/subjects.js';
import { HF_TP, HT_FP, compute, factsOf } from './fixtures.js';

const OVERALL = overallSubject();
const N1 = '2026-09-02';
const N2 = '2026-09-16';
const SPRING = '2026-03-04';

// N1: Hans & Frode win set 1 (3–0); set 2 Hans & Tor vs Frode & Per is unfinished.
// N2: Kari sits out (roster only); Hans & Frode lose 0–3 to Tor & Per.
// A night without games does not count; Ola is only there.
const NIGHTS = [
  { date: N1, matches: [[HF_TP, 'AAA'], [HT_FP, 'AB']] },
  { date: N2, players: ['Kari'], matches: [[HF_TP, 'BBB']] },
  { date: '2026-09-30', players: ['Ola'], matches: [] },
];

const table = (facts) => compute('leagueTable', facts, OVERALL);
const cells = (value) => value.rows.map((r) => [r.rank, r.player, r.nights, r.setsWon, r.points]);

test('leagueTable: columns rank, player, nights, setsWon, points', () => {
  assert.deepEqual(table(factsOf(NIGHTS)).columns.map((c) => [c.key, c.format]), [
    ['rank', 'int'], ['player', 'player'], ['nights', 'int'], ['setsWon', 'int'], ['points', 'int'],
  ]);
});

test('leagueTable: 1 point per played night attended, 2 per finished set won; sitting out counts as a night', () => {
  assert.equal(LEAGUE_POINTS_NIGHT, 1);
  assert.equal(LEAGUE_POINTS_SET_WON, 2);
  // Points tie (4) → more sets won first, then name.
  assert.deepEqual(cells(table(factsOf(NIGHTS))), [
    [1, 'Frode', 2, 1, 4],
    [2, 'Hans', 2, 1, 4],
    [3, 'Per', 2, 1, 4],
    [4, 'Tor', 2, 1, 4],
    [5, 'Kari', 1, 0, 1],
  ]);
});

test('leagueTable: sorted by points, then sets won, then name; rows link to the player', () => {
  const value = table(factsOf([
    { date: N1, matches: [[HF_TP, 'AAA'], [HT_FP, 'AAA']] },
    { date: N2, players: ['Kari'], matches: [[HT_FP, 'BBB']] },
  ]));
  // Hans (won N1 #1, #2) and Frode (won N1 #1, N2): 2 nights + 2 × 2 sets = 6 each → name.
  assert.deepEqual(cells(value), [
    [1, 'Frode', 2, 2, 6],
    [2, 'Hans', 2, 2, 6],
    [3, 'Per', 2, 1, 4],
    [4, 'Tor', 2, 1, 4],
    [5, 'Kari', 1, 0, 1],
  ]);
  assert.deepEqual(value.rows[0].subject, playerSubject('Frode'));
});

test('leagueTable: follows the period; null without a played night', () => {
  const nights = [{ date: SPRING, matches: [[HF_TP, 'AAA']] }, { date: N1, matches: [['Tor Per - Frode Ola', 'AAA']] }];
  const autumn = table(factsOf(nights, { kind: 'season', year: 2026, half: 2 }));
  assert.deepEqual(cells(autumn).map(([, player, n, s, p]) => [player, n, s, p]), [
    ['Per', 1, 1, 3], ['Tor', 1, 1, 3], ['Frode', 1, 0, 1], ['Ola', 1, 0, 1],
  ]);
  assert.deepEqual(cells(table(factsOf(nights, nightFilter(SPRING)))).map((r) => r[1]), ['Frode', 'Hans', 'Per', 'Tor']);
  assert.equal(table(factsOf([])), null);
  assert.equal(table(factsOf([{ date: N1, players: ['Ola'], matches: [] }])), null);
});
