import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overallSubject, pairSubject, playerSubject } from '../../../../docs/js/domain/stats/subjects.js';
import { nightFilter } from '../../../../docs/js/domain/stats/filter.js';
import { HF_TP, HT_FP, compute as computeStat, factsOf } from './fixtures.js';

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
    [['rank', 'int'], ['player', 'player'], ['rating', 'rating'], ['change', 'signed'], ['games', 'int'], ['attendance', 'countShare'], ['form', 'form']]);
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

test('leaderboard: rating is the current rating whatever the period; change and games are within the period', () => {
  const nights = [{ date: SPRING, matches: [[HF_TP, 'A']] }, { date: N1, matches: [[HF_TP, 'D']] }];
  const drawDelta = 24 * (0.5 - 1 / (1 + 10 ** (-24 / 400)));
  const hans = compute('leaderboard', factsOf(nights, SPRING_FILTER)).rows.find((r) => r.player === 'Hans');
  close(hans.rating, 1012 + drawDelta);
  close(hans.change, 12);
  assert.equal(hans.games, 1);
});

test('leaderboard: everyone who has played is listed; no games in the period → games 0, change null', () => {
  const nights = [{ date: SPRING, matches: [[HF_TP, 'A']] }, { date: N1, matches: [['Tor Per - Frode Ola', 'A']] }];
  const value = compute('leaderboard', factsOf(nights, AUTUMN));
  const hans = value.rows.find((r) => r.player === 'Hans');
  assert.equal(hans.rating, 1012);
  assert.equal(hans.games, 0);
  assert.equal(hans.change, null);
  assert.equal(value.rows.length, 5);
});

test('leaderboard: form is the last 10 games in the period, oldest first; [] without games in the period', () => {
  const nights = [
    { date: SPRING, matches: [[HF_TP, 'A']] },
    { date: N1, matches: [['Tor Per - Frode Ola', 'BBBBBDDDAAAA']] },
  ];
  const form = (name) => compute('leaderboard', factsOf(nights, AUTUMN)).rows.find((r) => r.player === name).form;
  assert.deepEqual(form('Tor'), ['L', 'L', 'L', 'D', 'D', 'D', 'W', 'W', 'W', 'W'], '12 games: the last 10');
  assert.deepEqual(form('Ola'), ['W', 'W', 'W', 'D', 'D', 'D', 'L', 'L', 'L', 'L']);
  assert.deepEqual(form('Hans'), []);
});

test('leaderboard: provisional reflects all games played so far', () => {
  const nights = (springDraws) => [
    { date: SPRING, matches: [[HF_TP, 'D'.repeat(springDraws)]] },
    { date: N1, matches: [[HF_TP, 'DDDDD']] },
  ];
  const provisional = (facts) => compute('leaderboard', facts).rows[0].provisional;
  assert.equal(provisional(factsOf(nights(4), AUTUMN)), true, '4 + 5 games');
  assert.equal(provisional(factsOf(nights(5), SPRING_FILTER)), false, '5 + 5 games, whatever the period');
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

test('longestMatch: most games; belongs to both teams, so no holders but the match with its score', () => {
  const facts = factsOf([{ date: N1, matches: [[HF_TP, 'ADBDAA'], [HF_TP, 'BBB']] }]);
  assert.deepEqual(compute('longestMatch', facts), {
    value: 6, format: 'int', holders: [], date: N1, matchId: `${N1}#1`,
    match: { A: ['Hans', 'Frode'], B: ['Tor', 'Per'], score: { A: 3, B: 1, D: 2 } },
  });
});

test('longestMatch: tie → most recent, unfinished matches count', () => {
  const facts = factsOf([
    { date: N1, matches: [[HF_TP, 'ADBDAA']] },
    { date: N2, matches: [[HF_TP, 'DDBDDD']] },
  ]);
  assert.deepEqual(compute('longestMatch', facts), {
    value: 6, format: 'int', holders: [], date: N2, matchId: `${N2}#1`,
    match: { A: ['Hans', 'Frode'], B: ['Tor', 'Per'], score: { A: 0, B: 1, D: 5 } },
  });
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

test('longestWinStreak: one player\'s run across sets and nights; a draw or loss ends it', () => {
  // Hans: L W W | W W W W D (N2) | W L — 6 across two nights and two sets, ended by a draw.
  // Frode: L W W | W W L L D — 4, ended by a loss in the second set of N2.
  const facts = factsOf([
    { date: N1, matches: [[HF_TP, 'BAA']] },
    { date: N2, matches: [[HF_TP, 'AA'], [HT_FP, 'AAD']] },
    { date: N3, matches: [[HF_TP, 'AB']] },
  ]);
  assert.deepEqual(compute('longestWinStreak', facts), { value: 6, format: 'int', holders: ['Hans'], date: N2 });
});

test('longestWinStreak: tie → most recent run end; teammates ending in the same game share it', () => {
  const facts = factsOf([
    { date: N1, matches: [['Kari Ola - Tor Per', 'AAB']] },
    { date: N2, matches: [[HF_TP, 'BAA']] },
  ]);
  assert.deepEqual(compute('longestWinStreak', facts), { value: 2, format: 'int', holders: ['Frode', 'Hans'], date: N2 });
});

test('longestWinStreak: works on a single night; null when nobody won a game', () => {
  const nights = [{ date: N1, matches: [[HF_TP, 'AAA']] }, { date: N2, matches: [[HF_TP, 'BD']] }];
  assert.deepEqual(compute('longestWinStreak', factsOf(nights, nightFilter(N2))),
    { value: 1, format: 'int', holders: ['Per', 'Tor'], date: N2 });
  assert.equal(compute('longestWinStreak', factsOf([{ date: N1, matches: [[HF_TP, 'DD']] }])), null);
  assert.equal(compute('longestWinStreak', EMPTY), null);
});

test('cleanSweeps: count of 3–0 sets without draws, ranked by the players who won most of them', () => {
  const facts = factsOf([
    { date: N1, matches: [[HF_TP, 'AAA'], [HF_TP, 'AADA'], [HF_TP, 'BBB'], [HF_TP, 'AA']] },
    { date: N2, matches: [[HF_TP, 'AAA'], ['Hans Kari - Tor Per', 'AAA']] },
  ]);
  assert.deepEqual(compute('cleanSweeps', facts), {
    value: 4, format: 'int', holders: [],
    ranking: [{ name: 'Hans', count: 3 }, { name: 'Frode', count: 2 }, { name: 'Kari', count: 1 }],
  });
  assert.equal(compute('cleanSweeps', factsOf([{ date: N1, matches: [[HF_TP, 'AADA'], [HF_TP, 'AA']] }])), null);
});

test('comebacks: winner trailed 0–2 and won 3–2 (draws allowed); unfinished never count; ranked by winners', () => {
  const facts = factsOf([
    { date: N1, matches: [[HF_TP, 'BBAAA'], [HF_TP, 'ABBAA'], [HF_TP, 'BBAAB']] },
    { date: N2, matches: [[HF_TP, 'ADADBDB'], [HF_TP, 'BDBAADA'], [HF_TP, 'AABB']] },
  ]);
  assert.deepEqual(compute('comebacks', facts), {
    value: 2, format: 'int', holders: [], ranking: [{ name: 'Frode', count: 2 }, { name: 'Hans', count: 2 }],
  });
  assert.equal(compute('comebacks', factsOf([{ date: N1, matches: [[HF_TP, 'BBAA'], [HF_TP, 'ABBAA']] }])), null);
});

test('biggestUpset: the finished set won by the lower-rated team, gap at the start of the set', () => {
  const facts = factsOf([{ date: N1, matches: [[HF_TP, 'AAA'], [HF_TP, 'BBB']] }]);
  const [first] = facts.matches[1].games;
  assert.deepEqual(compute('biggestUpset', facts), {
    value: first.ratingA - first.ratingB, format: 'rating', holders: ['Tor', 'Per'], date: N1, matchId: `${N1}#2`,
    match: { A: ['Hans', 'Frode'], B: ['Tor', 'Per'], score: { A: 0, B: 3, D: 0 } },
  });
});

test('biggestUpset: a game won inside a lost set is no upset; unfinished sets never count', () => {
  assert.equal(compute('biggestUpset', factsOf([{ date: N1, matches: [[HF_TP, 'AAA'], [HF_TP, 'BAAA']] }])), null);
  assert.equal(compute('biggestUpset', factsOf([{ date: N1, matches: [[HF_TP, 'AAA'], [HF_TP, 'BB']] }])), null);
});

test('biggestUpset: tie → most recent', () => {
  const facts = factsOf([{ date: N1, matches: [
    [HF_TP, 'AAA'], ['Wenche Xena - Yngve Zeb', 'AAA'], [HF_TP, 'BBB'], ['Wenche Xena - Yngve Zeb', 'BBB'],
  ] }]);
  const value = compute('biggestUpset', facts);
  assert.deepEqual([value.holders, value.matchId], [['Yngve', 'Zeb'], `${N1}#4`]);
});

test('biggestUpset: null when favourites win every set', () => {
  assert.equal(compute('biggestUpset', factsOf([{ date: N1, matches: [[HF_TP, 'AADA']] }])), null);
  assert.equal(compute('biggestUpset', EMPTY), null);
});

// ---------- highest / lowest rating ----------

// Hans and Frode win 6 of their first 9 games in spring (provisional), then lose 3 in autumn
// (games 10–12); Tor and Per mirror them. Settled extremes: after game 10 (Hans/Frode high,
// Tor/Per low); teammates tie, so the later row (Frode, Per) holds the record.
const EXTREMES = [
  { date: SPRING, matches: [[HF_TP, 'AAA'], [HF_TP, 'BBB'], [HF_TP, 'AAA']] },
  { date: N1, matches: [[HF_TP, 'BBB']] },
];
const rowOf = (facts, player, gameNo) => facts.rows.find((r) => r.player === player && r.date === N1 && r.gameNo === gameNo);

test('highestRating: the highest rating after a game, provisional games left out; tie → most recent', () => {
  const facts = factsOf(EXTREMES);
  const hansProvisionalPeak = facts.rows.filter((r) => r.player === 'Hans' && r.date === SPRING).at(-1).ratingAfter;
  const value = compute('highestRating', facts);
  assert.ok(hansProvisionalPeak > value.value, 'a provisional rating never counts');
  assert.deepEqual(value, { value: rowOf(facts, 'Frode', 1).ratingAfter, format: 'rating', holders: ['Frode'], date: N1, matchId: `${N1}#1` });
});

test('lowestRating: the lowest rating after a game, provisional games left out; tie → most recent', () => {
  const facts = factsOf(EXTREMES);
  assert.deepEqual(compute('lowestRating', facts),
    { value: rowOf(facts, 'Per', 1).ratingAfter, format: 'rating', holders: ['Per'], date: N1, matchId: `${N1}#1` });
});

test('highestRating / lowestRating: follow the season filter, game count is all-time', () => {
  const autumn = factsOf(EXTREMES, AUTUMN);
  assert.equal(compute('highestRating', autumn).value, rowOf(autumn, 'Frode', 1).ratingAfter);
  assert.equal(compute('lowestRating', autumn).value, rowOf(autumn, 'Per', 1).ratingAfter);
  const spring = factsOf(EXTREMES, SPRING_FILTER);
  assert.equal(compute('highestRating', spring), null);
  assert.equal(compute('lowestRating', spring), null);
});

test('highestRating / lowestRating: null when nobody is past the provisional games', () => {
  assert.equal(compute('highestRating', factsOf([{ date: N1, matches: [[HF_TP, 'AAA']] }])), null);
  assert.equal(compute('lowestRating', EMPTY), null);
});

test('longestNight: the night with most games, who was there; tie → most recent; null without games', () => {
  const facts = factsOf([
    { date: N1, matches: [[HF_TP, 'ADBDAA'], [HF_TP, 'BBB']] },
    { date: N2, players: ['Kari'], matches: [[HF_TP, 'DDAAA'], [HF_TP, 'BDBB']] },
  ]);
  assert.deepEqual(compute('longestNight', facts),
    { value: 9, format: 'int', holders: ['Frode', 'Hans', 'Kari', 'Per', 'Tor'], date: N2 });
  assert.equal(compute('longestNight', EMPTY), null);
});

// ---------- attendanceStreak ----------

test('attendanceStreak: longest run of played nights on the roster; sitting out counts; a missed night breaks it', () => {
  const facts = factsOf([
    { date: N1, matches: [[HF_TP, 'A']] },
    { date: N2, players: ['Kari'], matches: [[HF_TP, 'A']] },
    { date: N3, matches: [[HF_TP, 'A']] },
  ]);
  assert.deepEqual(compute('attendanceStreak', facts),
    { value: 3, format: 'int', holders: ['Frode', 'Hans', 'Per', 'Tor'], date: N3 });
  const broken = factsOf([
    { date: N1, matches: [[HF_TP, 'A']] },
    { date: N2, matches: [['Kari Dag - Hans Per', 'A']] },
  ]);
  assert.deepEqual(compute('attendanceStreak', broken),
    { value: 2, format: 'int', holders: ['Hans', 'Per'], date: N2 });
});

test('attendanceStreak: tie → most recent run end, only those whose run ended then; nights without games are skipped', () => {
  const facts = factsOf([
    { date: N1, matches: [[HF_TP, 'A']] },
    { date: N2, matches: [[HF_TP, 'A']] },
    { date: '2026-09-23', matches: [['Hans Kari - Frode Per', '']] },
    { date: N3, matches: [['Kari Dag - Frode Per', 'A']] },
    { date: '2026-10-07', matches: [['Kari Dag - Frode Per', 'B']] },
  ]);
  assert.deepEqual(compute('attendanceStreak', facts),
    { value: 4, format: 'int', holders: ['Frode', 'Per'], date: '2026-10-07' });
});

test('attendanceStreak: equal runs → the one ending last wins; earlier-ending holders are left out', () => {
  const facts = factsOf([
    { date: N1, matches: [['Hans Tor - Anne Bo', 'A']] },
    { date: N2, matches: [['Hans Tor - Anne Bo', 'A']] },
    { date: N3, matches: [['Kari Dag - Cato Eli', 'A']] },
    { date: '2026-10-07', matches: [['Kari Dag - Cato Eli', 'B']] },
  ]);
  // Anne, Bo, Hans, Tor: 2 ending N2; Kari, Dag, Cato, Eli: 2 ending 10-07.
  assert.deepEqual(compute('attendanceStreak', facts),
    { value: 2, format: 'int', holders: ['Cato', 'Dag', 'Eli', 'Kari'], date: '2026-10-07' });
});

test('attendanceStreak: null without played nights', () => {
  assert.equal(compute('attendanceStreak', factsOf([{ date: N1, matches: [[HF_TP, '']] }])), null);
  assert.equal(compute('attendanceStreak', EMPTY), null);
});
