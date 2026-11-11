import { isProvisional, ratingOf } from '../../elo.js';
import { byName } from '../../players.js';
import { playerSubject } from '../subjects.js';
import { FORM_GAMES } from '../constants.js';
import { attendanceOf, lastOutcomes } from '../aggregate.js';

/** Columns of the leaderboards (overall and the night's). */
export const LEADERBOARD_COLUMNS = [
  { key: 'rank', format: 'int' }, { key: 'player', format: 'player' }, { key: 'rating', format: 'rating' },
  { key: 'change', format: 'signed' }, { key: 'games', format: 'int' },
  { key: 'form', format: 'form' },
];

/**
 * Leaderboard rows for the given players, unranked: current rating, and change, games and form
 * within the period. Change = game deltas + no-show penalties in the period (spec §8); without
 * games or penalties in the period it is null; without games, games is 0 and form [].
 * @param {import('../facts.js').Facts} facts
 * @param {string[]} players
 */
export function leaderboardRows(facts, players) {
  const { rated } = facts;
  const inPeriod = new Map();
  const entryOf = (player) => {
    if (!inPeriod.has(player)) inPeriod.set(player, { change: 0, games: 0, rows: [] });
    return inPeriod.get(player);
  };
  for (const row of facts.rows) {
    const entry = entryOf(row.player);
    entry.change += row.delta;
    entry.games += 1;
    entry.rows.push(row);
  }
  for (const { player, change } of facts.penalties) entryOf(player).change += change;
  return players.map((player) => {
    const period = inPeriod.get(player);
    return {
      player, rating: ratingOf(rated, player), change: period ? period.change : null, games: period ? period.games : 0,
      form: period ? lastOutcomes(period.rows, FORM_GAMES) : [],
      provisional: isProvisional(rated, player), subject: playerSubject(player),
    };
  });
}

/** The overall leaderboard adds oppmøte (nights there, share of nights) after games. */
const OVERALL_COLUMNS = LEADERBOARD_COLUMNS.flatMap((column) =>
  (column.key === 'games' ? [column, { key: 'attendance', format: 'countShare' }] : [column]));

/** Numbers sorted rows 1, 2, 3 … in their order. */
export const ranked = (rows) => rows.map((row, i) => ({ rank: i + 1, ...row }));

/**
 * Elo leaderboard. A rating belongs to a moment, not to a season, so `rating` is everyone's
 * current rating whatever the period; `change` (sum of rating changes, no-show penalties included) and `games` are within
 * the period, and so is `form` (the last FORM_GAMES outcomes, oldest first). Everyone who has
 * ever played is listed; without games in the period, games is 0, change is null and form is [].
 * `attendance` is oppmøte in the period ({ count, share }). Provisional reflects all games played so far.
 * @type {import('../registry.js').Stat}
 */
export const leaderboard = {
  id: 'leaderboard',
  subjects: ['overall'],
  kind: 'table',
  compute(facts) {
    const { rated } = facts;
    if (rated.ratings.size === 0) return null;
    const rows = leaderboardRows(facts, [...rated.ratings.keys()])
      .map((row) => ({ ...row, attendance: attendanceOf(facts, row.player) }))
      .sort((a, b) => b.rating - a.rating || byName(a.player, b.player));
    return { columns: OVERALL_COLUMNS, rows: ranked(rows) };
  },
};
