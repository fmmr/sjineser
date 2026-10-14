import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overallSubject, pairSubject, playerSubject } from '../../../../docs/js/domain/stats/subjects.js';
import { HF_TP, compute as computeStat, factsOf } from './fixtures.js';

const OVERALL = overallSubject();
const N1 = '2026-09-02';
const N2 = '2026-09-16';
const N3 = '2026-09-30';
const SPRING = '2026-03-04';
const AUTUMN = { kind: 'season', year: 2026, half: 2 };
const SPRING_FILTER = { kind: 'season', year: 2026, half: 1 };
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≉ ${expected}`);

const compute = (id, facts, subject = OVERALL) => computeStat(id, facts, subject);

const EMPTY = factsOf([]);

// ---------- leaderboard ----------

test('leaderboard: rating, change and games; ties sorted by name; row subject = player', () => {
  const value = compute('leaderboard', factsOf([{ date: N1, matches: [[HF_TP, 'A']] }]));
  assert.deepEqual(value.columns.map((c) => [c.key, c.format]),
    [['rank', 'int'], ['player', 'player'], ['rating', 'rating'], ['change', 'signed'], ['games', 'int']]);
  assert.deepEqual(value.rows.map((r) => [r.rank, r.player, r.rating, r.change, r.games, r.provisional]), [
    [1, 'Frode', 1012, 12, 1, true],
    [2, 'Hans', 1012, 12, 1, true],
    [3, 'Per', 988, -12, 1, true],
    [4, 'Tor', 988, -12, 1, true],
  ]);
  assert.deepEqual(value.rows[0].subject, playerSubject('Frode'));
});

test('leaderboard: change is within the season; ratings continue from earlier seasons', () => {
  const nights = [{ date: SPRING, matches: [[HF_TP, 'A']] }, { date: N1, matches: [[HF_TP, 'D']] }];
  const value = compute('leaderboard', factsOf(nights, AUTUMN));
  const hans = value.rows.find((r) => r.player === 'Hans');
  const drawDelta = 24 * (0.5 - 1 / (1 + 10 ** (-24 / 400)));
  close(hans.rating, 1012 + drawDelta);
  close(hans.change, drawDelta);
  assert.equal(hans.games, 1);
  assert.deepEqual(value.rows.map((r) => r.player), ['Frode', 'Hans', 'Per', 'Tor']);
});

test('leaderboard: provisional counts all games up to the last game in scope', () => {
  const nights = (springDraws) => [
    { date: SPRING, matches: [[HF_TP, 'D'.repeat(springDraws)]] },
    { date: N1, matches: [[HF_TP, 'DDDDD']] },
  ];
  const provisional = (facts) => compute('leaderboard', facts).rows[0].provisional;
  assert.equal(provisional(factsOf(nights(9), AUTUMN)), false, '9 + 5 games');
  assert.equal(provisional(factsOf(nights(9), SPRING_FILTER)), true, '9 games up to the end of spring');
  assert.equal(provisional(factsOf(nights(10), SPRING_FILTER)), false, '10 games');
});

test('leaderboard: null without games', () => {
  assert.equal(compute('leaderboard', EMPTY), null);
});

// ---------- counts and draw rate ----------

test('nights, matches and games count only what has games', () => {
  const facts = factsOf([
    { date: N1, matches: [[HF_TP, 'AAA'], [HF_TP, 'DB'], [HF_TP, '']] },
    { date: N2, matches: [[HF_TP, '']] },
    { date: N3, players: ['Hans', 'Frode', 'Tor', 'Per'], matches: [] },
    { date: '2026-10-07', matches: [[HF_TP, 'BDBB']] },
  ]);
  assert.deepEqual(compute('nightsCount', facts), { value: 2, format: 'int' });
  assert.deepEqual(compute('matchesCount', facts), { value: 3, format: 'int' });
  assert.deepEqual(compute('gamesCount', facts), { value: 9, format: 'int' });
  assert.deepEqual(compute('gamesCount', EMPTY), { value: 0, format: 'int' });
});

test('drawRate: overall, player and pair; null without games', () => {
  const facts = factsOf([{ date: N1, matches: [[HF_TP, 'ADDA'], ['Hans Tor - Frode Ola', 'DBB']] }]);
  assert.deepEqual(compute('drawRate', facts), { value: 3 / 7, format: 'percent' });
  assert.deepEqual(compute('drawRate', facts, playerSubject('Per')), { value: 2 / 4, format: 'percent' });
  assert.deepEqual(compute('drawRate', facts, pairSubject('Tor', 'Hans')), { value: 1 / 3, format: 'percent' });
  assert.equal(compute('drawRate', facts, pairSubject('Per', 'Hans')), null);
  assert.equal(compute('drawRate', facts, playerSubject('Nobody')), null);
  assert.equal(compute('drawRate', EMPTY), null);
});

// ---------- records ----------

test('longestMatch: most games; complete → winners hold it', () => {
  const facts = factsOf([{ date: N1, matches: [[HF_TP, 'ADBDAA'], [HF_TP, 'BBB']] }]);
  assert.deepEqual(compute('longestMatch', facts),
    { value: 6, format: 'int', holders: ['Hans', 'Frode'], date: N1, matchId: `${N1}#1` });
});

test('longestMatch: tie → most recent; an unfinished match is held by all four', () => {
  const facts = factsOf([
    { date: N1, matches: [[HF_TP, 'ADBDAA']] },
    { date: N2, matches: [[HF_TP, 'DDBDDD']] },
  ]);
  assert.deepEqual(compute('longestMatch', facts),
    { value: 6, format: 'int', holders: ['Hans', 'Frode', 'Tor', 'Per'], date: N2, matchId: `${N2}#1` });
  assert.equal(compute('longestMatch', EMPTY), null);
});

test('longestDrawStreak: runs across matches within a night, resets between nights', () => {
  const facts = factsOf([
    { date: N1, matches: [[HF_TP, 'ADD'], [HF_TP, 'DBBB'], [HF_TP, 'BDD']] },
    { date: N2, matches: [[HF_TP, 'DAAA']] },
  ]);
  assert.deepEqual(compute('longestDrawStreak', facts), { value: 3, format: 'int', holders: [], date: N1 });
});

test('longestDrawStreak: tie → most recent; null without draws', () => {
  const facts = factsOf([
    { date: N1, matches: [[HF_TP, 'DDAAA']] },
    { date: N2, matches: [[HF_TP, 'BDDBB']] },
  ]);
  assert.deepEqual(compute('longestDrawStreak', facts), { value: 2, format: 'int', holders: [], date: N2 });
  assert.equal(compute('longestDrawStreak', factsOf([{ date: N1, matches: [[HF_TP, 'AAA']] }])), null);
});

test('cleanSweeps: 3–0 without draws; holders = most recent sweep', () => {
  const facts = factsOf([
    { date: N1, matches: [[HF_TP, 'AAA'], [HF_TP, 'AADA'], [HF_TP, 'BBB'], [HF_TP, 'AA']] },
    { date: N2, matches: [[HF_TP, 'ABAA']] },
  ]);
  assert.deepEqual(compute('cleanSweeps', facts),
    { value: 2, format: 'int', holders: ['Tor', 'Per'], date: N1, matchId: `${N1}#3` });
  assert.equal(compute('cleanSweeps', factsOf([{ date: N1, matches: [[HF_TP, 'AADA'], [HF_TP, 'AA']] }])), null);
});

test('comebacks: winner trailed 0–2 and won 3–2 (draws allowed); unfinished matches never count', () => {
  const facts = factsOf([
    { date: N1, matches: [[HF_TP, 'BBAAA'], [HF_TP, 'ABBAA'], [HF_TP, 'BBAAB']] },
    { date: N2, matches: [[HF_TP, 'ADADBDB'], [HF_TP, 'BDBAADA'], [HF_TP, 'AABB']] },
  ]);
  assert.deepEqual(compute('comebacks', facts),
    { value: 2, format: 'int', holders: ['Hans', 'Frode'], date: N2, matchId: `${N2}#2` });
  assert.equal(compute('comebacks', factsOf([{ date: N1, matches: [[HF_TP, 'BBAA'], [HF_TP, 'ABBAA']] }])), null);
});

test('biggestUpset: largest pre-game gap overcome by the winner', () => {
  const facts = factsOf([{ date: N1, matches: [[HF_TP, 'AB']] }]);
  assert.deepEqual(compute('biggestUpset', facts),
    { value: 24, format: 'rating', holders: ['Tor', 'Per'], date: N1, matchId: `${N1}#1` });
});

test('biggestUpset: tie → most recent', () => {
  const facts = factsOf([{ date: N1, matches: [
    [HF_TP, 'A'], ['Wenche Xena - Yngve Zeb', 'A'], [HF_TP, 'B'], ['Wenche Xena - Yngve Zeb', 'B'],
  ] }]);
  assert.deepEqual(compute('biggestUpset', facts),
    { value: 24, format: 'rating', holders: ['Yngve', 'Zeb'], date: N1, matchId: `${N1}#4` });
});

test('biggestUpset: null when favourites win or the underdog only draws', () => {
  assert.equal(compute('biggestUpset', factsOf([{ date: N1, matches: [[HF_TP, 'AADA']] }])), null);
  assert.equal(compute('biggestUpset', EMPTY), null);
});
