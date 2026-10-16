import { MIN_DECISIVE_GAMES } from '../constants.js';
import { decidingRows, minGamesFor, wdlOf, winRateOf } from '../aggregate.js';

/**
 * Avgjørende spill: the player's share of deciding games won (games where a team stood at
 * 2 wins, see decidingFlags). Needs MIN_DECISIVE_GAMES of them (one on a night page).
 * @type {import('../registry.js').Stat}
 */
export const decisiveWinRate = {
  id: 'decisiveWinRate',
  subjects: ['player'],
  kind: 'number',
  compute(facts, { name }) {
    const rows = decidingRows(facts).filter((r) => r.player === name);
    if (rows.length === 0 || rows.length < minGamesFor(facts.filter, MIN_DECISIVE_GAMES)) return null;
    return { value: winRateOf(wdlOf(rows)), format: 'percent' };
  },
};
