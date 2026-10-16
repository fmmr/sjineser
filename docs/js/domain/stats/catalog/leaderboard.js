import { isProvisional, ratingOf } from '../../elo.js';
import { byName } from '../../players.js';
import { playerSubject } from '../subjects.js';

/**
 * Elo leaderboard. A rating belongs to a moment, not to a season, so `rating` is everyone's
 * current rating whatever the period; `change` (sum of rating changes) and `games` are within
 * the period. Everyone who has ever played is listed; without games in the period, games is 0
 * and change is null. Provisional reflects all games played so far.
 * @type {import('../registry.js').Stat}
 */
export const leaderboard = {
  id: 'leaderboard',
  subjects: ['overall'],
  kind: 'table',
  compute(facts) {
    const { rated } = facts;
    if (rated.ratings.size === 0) return null;
    const inPeriod = new Map();
    for (const row of facts.rows) {
      const entry = inPeriod.get(row.player) ?? { change: 0, games: 0 };
      entry.change += row.delta;
      entry.games += 1;
      inPeriod.set(row.player, entry);
    }
    const rows = [...rated.ratings.keys()]
      .map((player) => {
        const period = inPeriod.get(player);
        return {
          player, rating: ratingOf(rated, player), change: period ? period.change : null, games: period ? period.games : 0,
          provisional: isProvisional(rated, player), subject: playerSubject(player),
        };
      })
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
