import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SANDBOX_PLAYERS, SANDBOX_SEED, generateHistory } from '../../docs/js/sandbox/generate.js';
import { gamesOf, isComplete, playersOf } from '../../docs/js/domain/match.js';
import { rateGames, ratingOf } from '../../docs/js/domain/elo.js';
import { seasonOf } from '../../docs/js/domain/season.js';

const { dataset, nextDate } = generateHistory();

const addDays = (date, days) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

test('generation is deterministic for a seed and differs between seeds', () => {
  assert.deepEqual(generateHistory(SANDBOX_SEED), generateHistory(SANDBOX_SEED));
  assert.notDeepEqual(generateHistory(SANDBOX_SEED + 1), generateHistory(SANDBOX_SEED));
});

test('the generated dataset is internally consistent', () => {
  assert.deepEqual(dataset.players.map((p) => p.name), SANDBOX_PLAYERS);
  const nights = new Map(dataset.nights.map((n) => [n.date, n]));
  const matchIds = new Set(dataset.matches.map((m) => m.matchId));
  for (const match of dataset.matches) {
    assert.ok(gamesOf(dataset, match.matchId).length > 0, `${match.matchId} has no games`);
    const roster = nights.get(match.date)?.players ?? [];
    for (const name of playersOf(match)) assert.ok(roster.includes(name), `${name} not at ${match.date}`);
  }
  for (const game of dataset.games) assert.ok(matchIds.has(game.matchId), game.matchId);
});

test('the history has the intended shape', () => {
  const dates = dataset.nights.map((n) => n.date).sort();
  assert.ok(dates.length >= 15, `${dates.length} nights`);
  const seasons = new Set(dates.map((d) => JSON.stringify(seasonOf(d))));
  assert.ok(seasons.size >= 3, `${seasons.size} seasons`);
  assert.ok(dataset.nights.some((n) => n.players.length >= 5));
  assert.ok(dataset.matches.some((m) => !isComplete(gamesOf(dataset, m.matchId))));
  const draws = dataset.games.filter((g) => g.result === 'D').length / dataset.games.length;
  assert.ok(draws >= 0.25 && draws <= 0.45, `draw share ${draws}`);
  assert.equal(nextDate, addDays(dates.at(-1), 14));
});

test('ratings reflect the hidden skills', () => {
  const rated = rateGames(dataset);
  assert.ok(ratingOf(rated, 'Anne') > ratingOf(rated, 'Frida'));
});

test('generation is fast', () => {
  const start = performance.now();
  generateHistory();
  assert.ok(performance.now() - start < 1000);
});
