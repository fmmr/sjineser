import { subjectRows, wdlOf, winRateOf } from '../aggregate.js';

/** Share of the player's or pair's games won. @type {import('../registry.js').Stat} */
export const gameWinRate = {
  id: 'gameWinRate',
  subjects: ['player', 'pair'],
  kind: 'number',
  compute(facts, subject) {
    const rows = subjectRows(facts, subject);
    return rows.length > 0 ? { value: winRateOf(wdlOf(rows)), format: 'percent' } : null;
  },
};
