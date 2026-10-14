import { MIN_GAMES_TOGETHER } from '../constants.js';
import { bestOf, wdlBy } from '../aggregate.js';
import { playerRows } from '../subjects.js';

/**
 * Opponent against whom the player has the lowest game win rate, among opponents faced in
 * ≥ MIN_GAMES_TOGETHER games; tie → more games, then name. @type {import('../registry.js').Stat}
 */
export const nemesis = {
  id: 'nemesis',
  subjects: ['player'],
  kind: 'record',
  compute(facts, { name }) {
    const qualified = wdlBy(playerRows(facts, name), (r) => r.opponents).filter((g) => g.games >= MIN_GAMES_TOGETHER);
    // wdlBy lists most games first, then by name; on a full tie the first listed wins.
    const worst = bestOf([...qualified].reverse(), (a, b) => b.winRate - a.winRate || a.games - b.games);
    return worst && { value: worst.winRate, format: 'percent', holders: [worst.key] };
  },
};
