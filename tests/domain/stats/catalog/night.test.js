import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nightFilter } from '../../../../docs/js/domain/stats/filter.js';
import { overallSubject, playerSubject } from '../../../../docs/js/domain/stats/subjects.js';
import { HF_TP, HT_FP, compute, factsOf } from './fixtures.js';

const OVERALL = overallSubject();
const N1 = '2026-09-02';
const N2 = '2026-09-16';

// N1: Frode & Hans win 3–0. N2: Kari sits out; set 1 Hans & Tor beat Frode & Per 3–1 with a
// draw, set 2 Kari plays and it is left at 1–0, set 3 started without games (not shown).
const NIGHTS = [
  { date: N1, matches: [[HF_TP, 'AAA']] },
  { date: N2, players: ['Kari', 'Ola'], matches: [[HT_FP, 'ADBAA'], ['Kari Frode - Tor Per', 'A'], [HF_TP, '']] },
];
const night = (date) => factsOf(NIGHTS, nightFilter(date));

/** A player's total rating change on a date, from the facts of every night. */
const gainOf = (name, date) => factsOf(NIGHTS).rows
  .filter((r) => r.player === name && r.date === date).reduce((sum, r) => sum + r.delta, 0);

test('nightSets: the night\'s sets with games, in play order, with score, winner and complete', () => {
  assert.deepEqual(compute('nightSets', night(N2), OVERALL).sets, [
    { matchId: `${N2}#1`, number: 1, A: ['Hans', 'Tor'], B: ['Frode', 'Per'], score: { A: 3, B: 1, D: 1 }, winner: 'A', complete: true },
    { matchId: `${N2}#2`, number: 2, A: ['Kari', 'Frode'], B: ['Tor', 'Per'], score: { A: 1, B: 0, D: 0 }, winner: null, complete: false },
  ]);
  assert.deepEqual(compute('nightSets', night(N1), OVERALL).sets.map((s) => s.matchId), [`${N1}#1`]);
  assert.equal(compute('nightSets', night('2026-09-30'), OVERALL), null);
});

test('nightLeaderboard: only the night\'s players (sitting out included), ranked by change tonight', () => {
  const value = compute('nightLeaderboard', night(N2), OVERALL);
  assert.deepEqual(value.columns.map((c) => c.key), ['rank', 'player', 'rating', 'change', 'games', 'form']);
  const byName = Object.fromEntries(value.rows.map((r) => [r.player, r]));
  assert.deepEqual(Object.keys(byName).sort(), ['Frode', 'Hans', 'Kari', 'Ola', 'Per', 'Tor']);
  const changes = value.rows.filter((r) => r.change !== null).map((r) => r.change);
  assert.deepEqual(changes, [...changes].sort((a, b) => b - a), 'sorted by change, most first');
  assert.deepEqual(value.rows.map((r) => r.rank), [1, 2, 3, 4, 5, 6]);
  assert.equal(byName.Ola.change, null);
  assert.equal(byName.Ola.games, 0);
  assert.deepEqual(byName.Ola.form, []);
  assert.equal(value.rows.at(-1).player, 'Ola', 'sitting out all night → last');
  assert.equal(byName.Hans.games, 5);
  assert.equal(byName.Kari.games, 1);
  assert.equal(byName.Hans.change, gainOf('Hans', N2));
  assert.deepEqual(byName.Hans.subject, playerSubject('Hans'));
  // Rating is the current rating: the same as on the overall leaderboard.
  const overall = compute('leaderboard', factsOf(NIGHTS), OVERALL).rows.find((r) => r.player === 'Hans');
  assert.equal(byName.Hans.rating, overall.rating);
});

test('nightLeaderboard: from the first game of the night; null before any game', () => {
  const first = factsOf([{ date: N1, players: ['Kari'], matches: [[HF_TP, 'D']] }], nightFilter(N1));
  assert.deepEqual(compute('nightLeaderboard', first, OVERALL).rows.map((r) => r.player).sort(), ['Frode', 'Hans', 'Kari', 'Per', 'Tor']);
  assert.equal(compute('nightLeaderboard', factsOf([{ date: N1, players: ['Kari', 'Ola'], matches: [] }], nightFilter(N1)), OVERALL), null);
});

test('nightWinner: the top of the night\'s leaderboard, with the rating won that night', () => {
  const facts = night(N2);
  const value = compute('nightWinner', facts, OVERALL);
  const top = compute('nightLeaderboard', facts, OVERALL).rows[0];
  assert.deepEqual(value.holders, [top.player]);
  assert.equal(value.value, top.change);
  assert.equal(value.format, 'signed');
  assert.equal(value.date, N2);
  const nightsRow = compute('nightsList', facts, OVERALL).rows[0];
  assert.deepEqual([nightsRow.winner, nightsRow.winnerGain], [top.player, top.change]);
});

test('nightWinner: over a longer period the biggest night win; null when nobody gained', () => {
  const all = compute('nightWinner', factsOf(NIGHTS), OVERALL);
  const best = [N1, N2].map((date) => compute('nightWinner', night(date), OVERALL)).sort((a, b) => b.value - a.value)[0];
  assert.deepEqual(all, best);
  assert.equal(compute('nightWinner', factsOf([{ date: N1, matches: [[HF_TP, 'D']] }]), OVERALL), null);
});

test('nightsList: each row links to its night page', () => {
  const rows = compute('nightsList', factsOf(NIGHTS), OVERALL).rows;
  assert.deepEqual(rows.map((r) => r.subject), [{ type: 'night', date: N2 }, { type: 'night', date: N1 }]);
});

test('existing stats work for a night: summary and records see only that night', () => {
  const facts = night(N2);
  assert.equal(compute('matchesCount', facts, OVERALL).value, 2);
  assert.equal(compute('gamesCount', facts, OVERALL).value, 6);
  assert.equal(compute('longestMatch', facts, OVERALL).matchId, `${N2}#1`);
  assert.equal(compute('cleanSweeps', facts, OVERALL), null);
  assert.equal(compute('cleanSweeps', night(N1), OVERALL).value, 1);
  assert.deepEqual(compute('pairsTable', facts, OVERALL).rows.map((r) => r.pair),
    [['Frode', 'Per'], ['Hans', 'Tor'], ['Frode', 'Kari'], ['Per', 'Tor']]);
});

test('kjemi in the pairs table counts from the first game on a night (10 games otherwise)', () => {
  const pairs = compute('pairsTable', night(N2), OVERALL).rows;
  assert.ok(pairs.every((r) => r.chemistry !== null), 'every pair that played tonight has a kjemi');
  assert.ok(compute('pairsTable', factsOf(NIGHTS), OVERALL).rows.every((r) => r.chemistry === null), 'all seasons: under 10 games');
});
