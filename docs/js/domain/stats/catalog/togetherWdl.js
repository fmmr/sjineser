import { wdlOf } from '../aggregate.js';
import { togetherRows } from '../subjects.js';

/** Games where a and b were partners. @type {import('../registry.js').Stat} */
export const togetherWdl = {
  id: 'togetherWdl',
  subjects: ['compare'],
  kind: 'wdl',
  compute(facts, { a, b }) {
    const rows = togetherRows(facts, a, b);
    return rows.length > 0 ? wdlOf(rows) : null;
  },
};
