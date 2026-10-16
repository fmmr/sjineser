import { byName } from '../../players.js';
import { playedNights } from './attendance.js';
import { LEADERBOARD_COLUMNS, leaderboardRows, ranked } from './leaderboard.js';
import { nightPlayers } from './nightsList.js';

/**
 * Kveldens rangering: the leaderboard (current rating; change, games and form in the period)
 * for only the players who were there (sitting out counts) — on the night page, the night's
 * players. Ranked by rating change, so the top row is the night's winner (same rule as
 * nightsList: tie → name order); sitting out (no change) last.
 * @type {import('../registry.js').Stat}
 */
export const nightLeaderboard = {
  id: 'nightLeaderboard',
  subjects: ['overall'],
  kind: 'table',
  compute(facts) {
    const nights = playedNights(facts);
    if (nights.length === 0) return null;
    const players = [...new Set(nights.flatMap(nightPlayers))];
    const rows = leaderboardRows(facts, players)
      .sort((a, b) => (b.change ?? -Infinity) - (a.change ?? -Infinity) || byName(a.player, b.player));
    return { columns: LEADERBOARD_COLUMNS, rows: ranked(rows) };
  },
};
