import { compareGames, teamOf } from './match.js';

/** Rating constants. The "how ratings work" page shows these, so change them only here. */
export const ELO = Object.freeze({ START: 1000, K: 24, SCALE: 400, PROVISIONAL_GAMES: 10 });

const ACTUAL_SCORE = { A: 1, D: 0.5, B: 0 };

/** Expected score (0–1) of a team rated `rating` against a team rated `opponent`. */
export const expectedScore = (rating, opponent) => 1 / (1 + 10 ** ((opponent - rating) / ELO.SCALE));

/**
 * @typedef {{
 *   ratings: Map<string, number>,
 *   gamesPlayed: Map<string, number>,
 *   timeline: { game: import('./match.js').Game, before: Map<string, number>, changes: Map<string, number> }[],
 * }} Rated
 */

/**
 * Replays every game in canonical order. A team's rating is the mean of its players;
 * both partners receive K × (actual − expected). Games of unknown matches are skipped.
 * Each timeline entry holds the four players' ratings before the game and their changes.
 * @param {import('./match.js').Dataset} dataset
 * @returns {Rated}
 */
export function rateGames(dataset) {
  const matches = new Map(dataset.matches.map((m) => [m.matchId, m]));
  const ratings = new Map();
  const gamesPlayed = new Map();
  const timeline = [];
  const rating = (name) => ratings.get(name) ?? ELO.START;
  const teamRating = ([first, second]) => (rating(first) + rating(second)) / 2;

  for (const game of [...dataset.games].sort(compareGames)) {
    const match = matches.get(game.matchId);
    if (!match) continue;
    const teamA = teamOf(match, 'A');
    const teamB = teamOf(match, 'B');
    const delta = ELO.K * (ACTUAL_SCORE[game.result] - expectedScore(teamRating(teamA), teamRating(teamB)));
    const before = new Map([...teamA, ...teamB].map((name) => [name, rating(name)]));
    const changes = new Map([...teamA.map((name) => [name, delta]), ...teamB.map((name) => [name, -delta])]);
    for (const [name, change] of changes) {
      ratings.set(name, rating(name) + change);
      gamesPlayed.set(name, (gamesPlayed.get(name) ?? 0) + 1);
    }
    timeline.push({ game, before, changes });
  }
  return { ratings, gamesPlayed, timeline };
}

/** @param {Rated} rated @param {string} name */
export const ratingOf = (rated, name) => rated.ratings.get(name) ?? ELO.START;

/** Display marker only; it does not change K. @param {Rated} rated @param {string} name */
export const isProvisional = (rated, name) => (rated.gamesPlayed.get(name) ?? 0) < ELO.PROVISIONAL_GAMES;
