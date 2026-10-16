import { MIN_GAMES_TOGETHER } from '../constants.js';
import { bestOf, wdlBy } from '../aggregate.js';
import { playerRows } from '../subjects.js';

/**
 * Opponent against whom the player has the highest game win rate, among opponents faced in
 * ≥ MIN_GAMES_TOGETHER games (any team size, like nemesis); tie → more games, then name.
 * @type {import('../registry.js').Stat}
 */
export const favoriteVictim = {
  id: 'favoriteVictim',
  subjects: ['player'],
  kind: 'record',
  compute(facts, { name }) {
    const qualified = wdlBy(playerRows(facts, name), (r) => r.opponents).filter((g) => g.games >= MIN_GAMES_TOGETHER);
    // wdlBy lists most games first, then by name; on a full tie the first listed wins.
    const best = bestOf([...qualified].reverse(), (a, b) => a.winRate - b.winRate || a.games - b.games);
    return best && { value: best.winRate, format: 'percent', holders: [best.key] };
  },
};
