import { compareGames, isNightOngoing, teamOf } from './match.js';

/**
 * Rating constants. The "how ratings work" page shows these, so change them only here.
 * NO_SHOW_PENALTY: points an active player loses for each played night they miss (after their first night).
 */
export const ELO = Object.freeze({ START: 1000, K: 24, SCALE: 400, PROVISIONAL_GAMES: 10, NO_SHOW_PENALTY: 10 });

const ACTUAL_SCORE = { A: 1, D: 0.5, B: 0 };

/** Expected score (0–1) of a team rated `rating` against a team rated `opponent`. */
export const expectedScore = (rating, opponent) => 1 / (1 + 10 ** ((opponent - rating) / ELO.SCALE));

/**
 * @typedef {{ game: import('./match.js').Game, before: Map<string, number>, changes: Map<string, number> }} GameEntry
 * @typedef {{ kind: 'penalty', date: string, player: string, change: number }} PenaltyEntry
 * @typedef {GameEntry | PenaltyEntry} TimelineEntry
 * @typedef {{
 *   ratings: Map<string, number>,
 *   gamesPlayed: Map<string, number>,
 *   timeline: TimelineEntry[],
 * }} Rated
 */

/** @param {TimelineEntry} entry @returns {entry is PenaltyEntry} */
export const isPenalty = (entry) => entry.kind === 'penalty';

/** The game entries of a timeline, in canonical order. @param {Rated} rated @returns {GameEntry[]} */
export const gameEntries = (rated) => rated.timeline.filter((entry) => !isPenalty(entry));

/** The no-show penalties of a timeline, in date order. @param {Rated} rated @returns {PenaltyEntry[]} */
export const penaltyEntries = (rated) => rated.timeline.filter(isPenalty);

/**
 * Replays every game in canonical order. A team's rating is the mean of its players (2 or 3,
 * so a 3-player team gets no extra advantage); every team member receives K × (actual − expected).
 * Games of unknown matches are skipped. Each game entry holds the ratings before the game
 * and the changes of everyone in the match (4–6 players).
 *
 * No-show penalty: after the last game of each played night (a night with a rated game), every
 * player who is active, played a game on an earlier night and is not on that night's roster
 * (sitting out counts as there) loses NO_SHOW_PENALTY. Penalty entries follow the night's game
 * entries in the timeline, so later games' expected scores use the penalised ratings.
 * With a clock, a night that is still ongoing (isNightOngoing) gets no penalties yet: players may
 * still arrive. Without one every played night counts (deterministic for tests and the sandbox).
 * @param {import('./match.js').Dataset} dataset
 * @param {{ today?: string, hour?: number }} [clock] today YYYY-MM-DD and the local hour (0–23)
 * @returns {Rated}
 */
export function rateGames(dataset, { today, hour } = {}) {
  const matches = new Map(dataset.matches.map((m) => [m.matchId, m]));
  const rosters = new Map(dataset.nights.map((n) => [n.date, n.players]));
  const active = dataset.players.filter((p) => p.active).map((p) => p.name);
  const ratings = new Map();
  const gamesPlayed = new Map();
  const timeline = [];
  const rating = (name) => ratings.get(name) ?? ELO.START;
  const teamRating = (team) => team.reduce((total, name) => total + rating(name), 0) / team.length;
  let night = null;
  let playedBefore = new Set();

  /** Penalties for `date`; `veterans` played before that night. */
  const penalise = (date, veterans) => {
    const roster = rosters.get(date);
    if (!roster || (today !== undefined && isNightOngoing(date, today, hour))) return;
    for (const player of active) {
      if (!veterans.has(player) || roster.includes(player)) continue;
      ratings.set(player, rating(player) - ELO.NO_SHOW_PENALTY);
      timeline.push({ kind: 'penalty', date, player, change: -ELO.NO_SHOW_PENALTY });
    }
  };

  for (const game of [...dataset.games].sort(compareGames)) {
    const match = matches.get(game.matchId);
    if (!match) continue;
    if (match.date !== night) {
      if (night !== null) penalise(night, playedBefore);
      night = match.date;
      playedBefore = new Set(gamesPlayed.keys());
    }
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
  if (night !== null) penalise(night, playedBefore);
  return { ratings, gamesPlayed, timeline };
}

/** @param {Rated} rated @param {string} name */
export const ratingOf = (rated, name) => rated.ratings.get(name) ?? ELO.START;

/** Display marker only; it does not change K. @param {Rated} rated @param {string} name */
export const isProvisional = (rated, name) => (rated.gamesPlayed.get(name) ?? 0) < ELO.PROVISIONAL_GAMES;
