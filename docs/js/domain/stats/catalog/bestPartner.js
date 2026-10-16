import { MIN_GAMES_TOGETHER } from '../constants.js';
import { bestOf, wdlBy } from '../aggregate.js';
import { isPairRow, playerRows } from '../subjects.js';

/**
 * Partner with the highest game win rate among partners with ≥ MIN_GAMES_TOGETHER games;
 * tie → more games, then name. A pair stat: only games as a 2-player team count.
 * @type {import('../registry.js').Stat}
 */
export const bestPartner = {
  id: 'bestPartner',
  subjects: ['player'],
  kind: 'record',
  compute(facts, { name }) {
    const rows = playerRows(facts, name).filter(isPairRow);
    const qualified = wdlBy(rows, (r) => r.partners).filter((g) => g.games >= MIN_GAMES_TOGETHER);
    // wdlBy lists most games first, then by name; on a full tie the first listed wins.
    const best = bestOf([...qualified].reverse(), (a, b) => a.winRate - b.winRate || a.games - b.games);
    return best && { value: best.winRate, format: 'percent', holders: [best.key] };
  },
};
