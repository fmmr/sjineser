import { wdlOf } from '../aggregate.js';
import { againstRows } from '../subjects.js';

/** Games where a played against b, from a's perspective. @type {import('../registry.js').Stat} */
export const againstWdl = {
  id: 'againstWdl',
  subjects: ['compare'],
  kind: 'wdl',
  compute(facts, { a, b }) {
    const rows = againstRows(facts, a, b);
    return rows.length > 0 ? wdlOf(rows) : null;
  },
};
