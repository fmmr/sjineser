import { wdlOf } from '../aggregate.js';
import { againstRows } from '../subjects.js';

/** Games where a played against b: a's wins, b's wins and the draws. @type {import('../registry.js').Stat} */
export const headToHead = {
  id: 'headToHead',
  subjects: ['compare'],
  kind: 'duel',
  compute(facts, { a, b }) {
    const rows = againstRows(facts, a, b);
    if (rows.length === 0) return null;
    const { W, D, L } = wdlOf(rows);
    return { left: { name: a, wins: W }, right: { name: b, wins: L }, draws: D };
  },
};
