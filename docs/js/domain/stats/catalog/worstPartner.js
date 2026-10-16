import { MIN_GAMES_TOGETHER } from '../constants.js';
import { bestOf, wdlBy } from '../aggregate.js';
import { isPairRow, playerRows } from '../subjects.js';

/**
 * Partner with the lowest game win rate among partners with ≥ MIN_GAMES_TOGETHER games;
 * tie → more games, then name. A pair stat (like bestPartner): only games as a 2-player team count.
 * @type {import('../registry.js').Stat}
 */
export const worstPartner = {
  id: 'worstPartner',
  subjects: ['player'],
  kind: 'record',
  compute(facts, { name }) {
    const rows = playerRows(facts, name).filter(isPairRow);
    const qualified = wdlBy(rows, (r) => r.partners).filter((g) => g.games >= MIN_GAMES_TOGETHER);
    // wdlBy lists most games first, then by name; on a full tie the first listed wins.
    const worst = bestOf([...qualified].reverse(), (a, b) => b.winRate - a.winRate || a.games - b.games);
    return worst && { value: worst.winRate, format: 'percent', holders: [worst.key] };
  },
};
