import { expectedScore } from '../../elo.js';
import { byName } from '../../players.js';
import { MIN_GAMES_TOGETHER } from '../constants.js';
import { isPairRow, pairKey, pairSubject, parsePairKey } from '../subjects.js';

const ACTUAL_SCORE = { W: 1, D: 0.5, L: 0 };

/** Actual minus expected score of one game, from the pre-game team ratings. @param {import('../facts.js').PlayerGameRow} row */
const surpriseOf = (row) => ACTUAL_SCORE[row.outcome] - expectedScore(row.teamRating, row.opponentRating);

/**
 * Kjemi of a pair from its games together (one row per game): mean actual − expected score
 * (−1 … 1), or null with fewer than MIN_GAMES_TOGETHER games.
 * @param {import('../facts.js').PlayerGameRow[]} rows
 * @returns {number | null}
 */
export function chemistryOf(rows) {
  if (rows.length < MIN_GAMES_TOGETHER) return null;
  return rows.reduce((sum, row) => sum + surpriseOf(row), 0) / rows.length;
}

/**
 * Kjemi: how much better (or worse) each pair (2-player team) scores than its ratings predict.
 * Pairs with ≥ MIN_GAMES_TOGETHER games together; best first, tie → more games, then names.
 * @type {import('../registry.js').Stat}
 */
export const chemistry = {
  id: 'chemistry',
  subjects: ['overall'],
  kind: 'table',
  compute(facts) {
    // One row per pair and game: the first partner's row by name (as in pairsTable).
    const groups = new Map();
    for (const row of facts.rows) {
      if (!isPairRow(row) || byName(row.player, row.partners[0]) > 0) continue;
      const key = pairKey([row.player, row.partners[0]]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    const rows = [...groups]
      .map(([key, pairRows]) => ({ names: parsePairKey(key), games: pairRows.length, value: chemistryOf(pairRows) }))
      .filter(({ value }) => value !== null)
      .sort((a, b) => b.value - a.value || b.games - a.games
        || byName(a.names[0], b.names[0]) || byName(a.names[1], b.names[1]))
      .map(({ names, games, value }) => ({ pair: names, games, chemistry: value, subject: pairSubject(...names) }));
    if (rows.length === 0) return null;
    return {
      columns: [{ key: 'pair', format: 'pair' }, { key: 'games', format: 'int' }, { key: 'chemistry', format: 'signedPercent' }],
      rows,
    };
  },
};
