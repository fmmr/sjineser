import { byName } from '../../players.js';
import { gamesUpToLastInScope, isProvisionalAfter } from '../aggregate.js';
import { playerSubject } from '../subjects.js';

/**
 * Elo leaderboard: rating after the last game in scope, change within the scope, games in
 * scope and the provisional marker (as of the player's last game in scope).
 * @type {import('../registry.js').Stat}
 */
export const leaderboard = {
  id: 'leaderboard',
  subjects: ['overall'],
  kind: 'table',
  compute(facts) {
    const players = new Map();
    for (const row of facts.rows) {
      const entry = players.get(row.player);
      if (entry) {
        entry.rating = row.ratingAfter;
        entry.games += 1;
      } else {
        players.set(row.player, { start: row.ratingBefore, rating: row.ratingAfter, games: 1 });
      }
    }
    if (players.size === 0) return null;
    const allTime = gamesUpToLastInScope(facts);
    const rows = [...players]
      .map(([player, { start, rating, games }]) => ({
        player, rating, change: rating - start, games,
        provisional: isProvisionalAfter(allTime.get(player)), subject: playerSubject(player),
      }))
      .sort((a, b) => b.rating - a.rating || byName(a.player, b.player))
      .map((row, i) => ({ rank: i + 1, ...row }));
    return {
      columns: [
        { key: 'rank', format: 'int' }, { key: 'player', format: 'player' }, { key: 'rating', format: 'rating' },
        { key: 'change', format: 'signed' }, { key: 'games', format: 'int' },
      ],
      rows,
    };
  },
};
