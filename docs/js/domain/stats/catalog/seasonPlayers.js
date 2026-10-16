import { byName } from '../../players.js';
import { formatFilter } from '../filter.js';
import { seasonOf } from '../../season.js';
import { playerSubject } from '../subjects.js';

/**
 * @typedef {{ season: import('../../season.js').Season, player: string, change: number, games: number }} SeasonWinner
 */

/** Season sort key, e.g. '2026-1' (sorts chronologically as text). */
const seasonKey = (season) => formatFilter({ kind: 'season', ...season });

/**
 * Sesongens spiller: per season (half-year) with games, the player with the largest total rating
 * change (sum of deltas) in it; tie → more games, then name. Newest season first; the current
 * season is simply the newest. Only over all seasons: with a season or night filter the facts do
 * not hold the other seasons, so the list is empty.
 * @param {import('../facts.js').Facts} facts
 * @returns {SeasonWinner[]}
 */
export function seasonWinners(facts) {
  if (facts.filter.kind !== 'all') return [];
  const seasons = new Map();
  for (const { date, player, delta } of facts.rows) {
    const season = seasonOf(date);
    const key = seasonKey(season);
    if (!seasons.has(key)) seasons.set(key, { season, players: new Map() });
    const { players } = seasons.get(key);
    const entry = players.get(player) ?? { change: 0, games: 0 };
    players.set(player, { change: entry.change + delta, games: entry.games + 1 });
  }
  return [...seasons]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([, { season, players }]) => {
      const [player, { change, games }] = [...players]
        .sort(([nameA, a], [nameB, b]) => b.change - a.change || b.games - a.games || byName(nameA, nameB))[0];
      return { season, player, change, games };
    });
}

/**
 * Sesongens spiller: one row per season, newest first (see seasonWinners). Inherently across
 * seasons, so it is shown only when the filter is all seasons (null otherwise).
 * @type {import('../registry.js').Stat}
 */
export const seasonPlayers = {
  id: 'seasonPlayers',
  subjects: ['overall'],
  kind: 'table',
  compute(facts) {
    const rows = seasonWinners(facts);
    if (rows.length === 0) return null;
    return {
      columns: [
        { key: 'season', format: 'season' }, { key: 'player', format: 'player' },
        { key: 'change', format: 'signed' }, { key: 'games', format: 'int' },
      ],
      rows: rows.map((row) => ({ ...row, subject: playerSubject(row.player) })),
    };
  },
};
