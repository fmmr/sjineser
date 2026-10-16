import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFacts } from '../../../docs/js/domain/stats/facts.js';
import { rateGames } from '../../../docs/js/domain/elo.js';
import { compareGames } from '../../../docs/js/domain/match.js';
import { generateHistory } from '../../../docs/js/sandbox/generate.js';
import { DATE, FOUR, MATCH_1, dataset, game, nightWithMatch } from '../../helpers.js';

const ALL = { kind: 'all' };
const SPRING = '2026-03-04';
const SPRING_FILTER = { kind: 'season', year: 2026, half: 1 };
const AUTUMN_FILTER = { kind: 'season', year: 2026, half: 2 };
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≉ ${expected}`);
const rowOf = (facts, player, matchId, gameNo) =>
  facts.rows.find((r) => r.player === player && r.matchId === matchId && r.gameNo === gameNo);

/**
 * Spring night: #1 complete A 3–0, #2 abandoned (one game), #10 with no games, #3 B 3–1 with a draw.
 * Autumn night (DATE): #1 with the given results.
 */
function twoSeasons(autumnResults = ['A', 'D']) {
  const autumn = nightWithMatch(autumnResults);
  const spring = (n) => `${SPRING}#${n}`;
  const seats = { A1: 'Hans', A2: 'Per', B1: 'Tor', B2: 'Frode' };
  return dataset({
    players: autumn.players,
    nights: [{ date: SPRING, players: FOUR }, ...autumn.nights],
    matches: [
      ...autumn.matches,
      { matchId: spring(10), date: SPRING, ...seats },
      { matchId: spring(3), date: SPRING, ...seats },
      { matchId: spring(2), date: SPRING, ...seats },
      { matchId: spring(1), date: SPRING, ...seats },
    ],
    games: [
      ...autumn.games,
      game(spring(3), 2, 'B'), game(spring(3), 1, 'D'), game(spring(3), 3, 'A'), game(spring(3), 4, 'B'), game(spring(3), 5, 'B'),
      game(spring(2), 1, 'B'),
      game(spring(1), 1, 'A'), game(spring(1), 2, 'A'), game(spring(1), 3, 'A'),
    ].map((g) => ({ ...g, timestamp: `${SPRING}T20:00:00Z` })),
  });
}

test('four rows per game with partners, opponents and side', () => {
  const facts = buildFacts(nightWithMatch(['A', 'B']), ALL);
  assert.equal(facts.games.length, 2);
  assert.equal(facts.rows.length, 8);
  const hans = rowOf(facts, 'Hans', MATCH_1, 1);
  assert.deepEqual(hans.partners, ['Frode']);
  assert.deepEqual(hans.opponents, ['Tor', 'Per']);
  assert.equal(hans.side, 'A');
  assert.equal(hans.date, DATE);
  const per = rowOf(facts, 'Per', MATCH_1, 1);
  assert.deepEqual(per.partners, ['Tor']);
  assert.deepEqual(per.opponents, ['Hans', 'Frode']);
  assert.equal(per.side, 'B');
});

test('3 vs 2: five rows per game; partners 1–2, opponents 2–3; team ratings are means', () => {
  const ds = nightWithMatch();
  ds.matches = [{ matchId: MATCH_1, date: DATE, A1: 'Hans', A2: 'Frode', A3: 'Kari', B1: 'Tor', B2: 'Per', B3: '' }];
  ds.games = [game(MATCH_1, 1, 'A'), game(MATCH_1, 2, 'B')];
  const facts = buildFacts(ds, ALL);
  assert.equal(facts.rows.length, 10);
  const kari = rowOf(facts, 'Kari', MATCH_1, 1);
  assert.deepEqual(kari.partners, ['Hans', 'Frode']);
  assert.deepEqual(kari.opponents, ['Tor', 'Per']);
  assert.equal(kari.outcome, 'W');
  const tor = rowOf(facts, 'Tor', MATCH_1, 2);
  assert.deepEqual(tor.partners, ['Per']);
  assert.deepEqual(tor.opponents, ['Hans', 'Frode', 'Kari']);
  const [hans, frode] = ['Hans', 'Frode'].map((p) => rowOf(facts, p, MATCH_1, 2));
  close(tor.opponentRating, (hans.ratingBefore + frode.ratingBefore + rowOf(facts, 'Kari', MATCH_1, 2).ratingBefore) / 3);
  close(facts.games[1].ratingA, tor.opponentRating);
  assert.deepEqual(facts.games[0].A, ['Hans', 'Frode', 'Kari']);
  assert.deepEqual(facts.matches[0].B, ['Tor', 'Per']);
  assert.deepEqual(facts.players, ['Frode', 'Hans', 'Kari', 'Per', 'Tor']);
});

test('outcomes follow the side: A win, B win and draw', () => {
  const facts = buildFacts(nightWithMatch(['A', 'B', 'D']), ALL);
  const outcomes = (gameNo) => Object.fromEntries(FOUR.map((p) => [p, rowOf(facts, p, MATCH_1, gameNo).outcome]));
  assert.deepEqual(outcomes(1), { Frode: 'W', Hans: 'W', Per: 'L', Tor: 'L' });
  assert.deepEqual(outcomes(2), { Frode: 'L', Hans: 'L', Per: 'W', Tor: 'W' });
  assert.deepEqual(outcomes(3), { Frode: 'D', Hans: 'D', Per: 'D', Tor: 'D' });
});

test('row ratings: after − before = delta; team ratings are means of the befores', () => {
  const facts = buildFacts(nightWithMatch(['A', 'A', 'B']), ALL);
  for (const row of facts.rows) close(row.ratingAfter - row.ratingBefore, row.delta);
  const [g2Hans, g2Frode, g2Tor, g2Per] = ['Hans', 'Frode', 'Tor', 'Per'].map((p) => rowOf(facts, p, MATCH_1, 2));
  close(g2Hans.teamRating, (g2Hans.ratingBefore + g2Frode.ratingBefore) / 2);
  close(g2Hans.opponentRating, (g2Tor.ratingBefore + g2Per.ratingBefore) / 2);
  close(g2Tor.teamRating, g2Hans.opponentRating);
  const game2 = facts.games[1];
  close(game2.ratingA, g2Hans.teamRating);
  close(game2.ratingB, g2Tor.teamRating);
  close(rowOf(facts, 'Hans', MATCH_1, 1).ratingAfter, g2Hans.ratingBefore);
});

test('ratings continue across seasons', () => {
  const facts = buildFacts(twoSeasons(), ALL);
  const hans = facts.rows.filter((r) => r.player === 'Hans');
  const lastSpring = hans.filter((r) => r.date === SPRING).at(-1);
  const firstAutumn = hans.find((r) => r.date === DATE);
  close(firstAutumn.ratingBefore, lastSpring.ratingAfter);
});

test('the filter removes rows, games, matches and nights but not ratings', () => {
  const all = buildFacts(twoSeasons(), ALL);
  const autumn = buildFacts(twoSeasons(), AUTUMN_FILTER);
  assert.deepEqual(autumn.filter, AUTUMN_FILTER);
  assert.equal(autumn.games.length, 2);
  assert.equal(autumn.rows.length, 8);
  assert.deepEqual(autumn.matches.map((m) => m.matchId), [MATCH_1]);
  assert.deepEqual(autumn.nights.map((n) => n.date), [DATE]);
  assert.ok(autumn.rows.every((r) => r.date === DATE));
  assert.deepEqual(autumn.rows, all.rows.filter((r) => r.date === DATE));
  assert.deepEqual(autumn.games, all.games.filter((g) => g.date === DATE));
  assert.equal(autumn.rated.timeline.length, all.rated.timeline.length);

  const spring = buildFacts(twoSeasons(), SPRING_FILTER);
  assert.deepEqual(spring.nights.map((n) => n.date), [SPRING]);
  assert.equal(spring.games.length, 9);
});

test('matches exclude those without games and are in canonical order', () => {
  const facts = buildFacts(twoSeasons(), ALL);
  assert.deepEqual(facts.matches.map((m) => m.matchId), [`${SPRING}#1`, `${SPRING}#2`, `${SPRING}#3`, MATCH_1]);
  const springNight = facts.nights.find((n) => n.date === SPRING);
  assert.deepEqual(springNight.players, FOUR);
  assert.deepEqual(springNight.matches.map((m) => m.matchId), [`${SPRING}#1`, `${SPRING}#2`, `${SPRING}#3`]);
});

test('match facts: teams, games, score, winner, complete (incl. abandoned)', () => {
  const facts = buildFacts(twoSeasons(), ALL);
  const [sweep, abandoned, comeback, autumn] = facts.matches;
  assert.deepEqual(sweep.A, ['Hans', 'Per']);
  assert.deepEqual(sweep.B, ['Tor', 'Frode']);
  assert.equal(sweep.date, SPRING);
  assert.deepEqual(sweep.score, { A: 3, B: 0, D: 0 });
  assert.equal(sweep.winner, 'A');
  assert.equal(sweep.complete, true);
  assert.deepEqual(abandoned.score, { A: 0, B: 1, D: 0 });
  assert.equal(abandoned.winner, null);
  assert.equal(abandoned.complete, false);
  assert.deepEqual(comeback.games.map((g) => g.gameNo), [1, 2, 3, 4, 5]);
  assert.deepEqual(comeback.score, { A: 1, B: 3, D: 1 });
  assert.equal(comeback.winner, 'B');
  assert.equal(autumn.complete, false);
});

test('rows and games are in canonical game order; players sorted by name', () => {
  const facts = buildFacts(twoSeasons(), ALL);
  const sorted = [...facts.games].sort(compareGames);
  assert.deepEqual(facts.games, sorted);
  assert.deepEqual(facts.rows.filter((_, i) => i % 4 === 0).map((r) => [r.matchId, r.gameNo]),
    sorted.map((g) => [g.matchId, g.gameNo]));
  assert.deepEqual(facts.players, ['Frode', 'Hans', 'Per', 'Tor']);
});

test('players are only those with rows in scope', () => {
  const ds = twoSeasons();
  ds.players = [...ds.players, { name: 'Ola', active: true }];
  ds.nights = [{ date: '2025-10-01', players: [...FOUR, 'Ola'] }, ...ds.nights];
  assert.deepEqual(buildFacts(ds, { kind: 'season', year: 2025, half: 2 }).players, []);
  assert.deepEqual(buildFacts(ds, { kind: 'season', year: 2025, half: 2 }).nights.map((n) => n.date), ['2025-10-01']);
});

test('generated history: facts agree with the Elo replay', () => {
  const { dataset: ds } = generateHistory();
  const facts = buildFacts(ds, ALL);
  const rated = rateGames(ds);
  assert.equal(facts.games.length, rated.timeline.length);
  // One row per player per game: 4–6 per game, as teams have 2 or 3 players.
  const seated = facts.games.reduce((total, g) => total + g.A.length + g.B.length, 0);
  assert.equal(facts.rows.length, seated);
  for (const name of facts.players) {
    close(facts.rows.filter((r) => r.player === name).at(-1).ratingAfter, rated.ratings.get(name));
  }
  const matchIds = new Set(ds.games.map((g) => g.matchId));
  assert.equal(facts.matches.length, matchIds.size);
  assert.ok(facts.matches.some((m) => !m.complete));
});

test('generated history: season facts are slices of all-time facts', () => {
  const { dataset: ds } = generateHistory();
  const all = buildFacts(ds, ALL);
  const autumn = buildFacts(ds, { kind: 'season', year: 2025, half: 2 });
  assert.ok(autumn.rows.length > 0 && autumn.rows.length < all.rows.length);
  assert.deepEqual(autumn.rows, all.rows.filter((r) => r.date < '2026-01-01'));
  assert.ok(autumn.nights.every((n) => n.date >= '2025-07-01' && n.date <= '2025-12-31'));
});
