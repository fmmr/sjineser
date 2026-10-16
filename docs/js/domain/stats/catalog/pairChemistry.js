import { chemistryOf } from '../aggregate.js';
import { pairRows } from '../subjects.js';

/** Kjemi of a and b as a pair (2-player team); null unless they have enough games together. @type {import('../registry.js').Stat} */
export const pairChemistry = {
  id: 'pairChemistry',
  subjects: ['compare'],
  kind: 'number',
  compute(facts, { a, b }) {
    const value = chemistryOf(pairRows(facts, [a, b]));
    return value === null ? null : { value, format: 'signedPercent' };
  },
};
