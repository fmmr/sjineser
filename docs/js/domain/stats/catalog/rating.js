import { gamesUpToLastInScope, isProvisionalAfter } from '../aggregate.js';
import { playerRows } from '../subjects.js';

/** Rating after the player's last game in scope; marked provisional as of that game. @type {import('../registry.js').Stat} */
export const rating = {
  id: 'rating',
  subjects: ['player'],
  kind: 'number',
  compute(facts, { name }) {
    const last = playerRows(facts, name).at(-1);
    if (!last) return null;
    const provisional = isProvisionalAfter(gamesUpToLastInScope(facts).get(name));
    return { value: last.ratingAfter, format: 'rating', ...(provisional && { marker: 'provisional' }) };
  },
};
