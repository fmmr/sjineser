import { byName } from '../../players.js';
import { MIN_DECISIVE_GAMES } from '../constants.js';
import { decidingRows, minGamesFor, wdlBy, wdlColumns } from '../aggregate.js';
import { playerSubject } from '../subjects.js';

/**
 * Avgjørende spill: every player with at least MIN_DECISIVE_GAMES deciding games (one on a night
 * page) — games where a team stood at 2 wins — with W/D/L and win share in them; by win share,
 * then games, then name. Rows link to the player.
 * @type {import('../registry.js').Stat}
 */
export const decisiveTable = {
  id: 'decisiveTable',
  subjects: ['overall'],
  kind: 'table',
  compute(facts) {
    const min = minGamesFor(facts.filter, MIN_DECISIVE_GAMES);
    const rows = wdlBy(decidingRows(facts), (r) => [r.player])
      .filter((g) => g.games >= min)
      .sort((a, b) => b.winRate - a.winRate || b.games - a.games || byName(a.key, b.key));
    if (rows.length === 0) return null;
    return {
      columns: wdlColumns('player', 'player'),
      rows: rows.map(({ key, ...wdl }) => ({ player: key, ...wdl, subject: playerSubject(key) })),
    };
  },
};
