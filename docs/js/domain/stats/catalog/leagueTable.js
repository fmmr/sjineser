import { byName } from '../../players.js';
import { LEAGUE_POINTS_NIGHT, LEAGUE_POINTS_SET_WON } from '../constants.js';
import { playedNights } from '../aggregate.js';
import { playerSubject } from '../subjects.js';
import { ranked } from './leaderboard.js';

/**
 * Ligatabell: per player who was at a played night in the period, the played nights they were at
 * (sitting out counts), the finished sets they won, and points = LEAGUE_POINTS_NIGHT per night +
 * LEAGUE_POINTS_SET_WON per set won. By points, then sets won, then name. Rows link to the player.
 * @type {import('../registry.js').Stat}
 */
export const leagueTable = {
  id: 'leagueTable',
  subjects: ['overall'],
  kind: 'table',
  compute(facts) {
    const totals = new Map();
    const entryOf = (player) => {
      if (!totals.has(player)) totals.set(player, { nights: 0, setsWon: 0 });
      return totals.get(player);
    };
    for (const night of playedNights(facts)) for (const player of night.players) entryOf(player).nights += 1;
    for (const match of facts.matches) {
      if (match.complete) for (const player of match[match.winner]) entryOf(player).setsWon += 1;
    }
    const rows = [...totals]
      .filter(([, { nights }]) => nights > 0)
      .map(([player, { nights, setsWon }]) => ({
        player, nights, setsWon, points: nights * LEAGUE_POINTS_NIGHT + setsWon * LEAGUE_POINTS_SET_WON,
        subject: playerSubject(player),
      }))
      .sort((a, b) => b.points - a.points || b.setsWon - a.setsWon || byName(a.player, b.player));
    if (rows.length === 0) return null;
    return {
      columns: [
        { key: 'rank', format: 'int' }, { key: 'player', format: 'player' },
        { key: 'nights', format: 'int' }, { key: 'setsWon', format: 'int' }, { key: 'points', format: 'int' },
      ],
      rows: ranked(rows),
    };
  },
};
