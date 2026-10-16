import { isProvisional, ratingOf } from '../../elo.js';

/**
 * The player's current rating — a rating belongs to a moment, not to the selected period —
 * marked provisional below the provisional game count. Null for someone who has never played.
 * @type {import('../registry.js').Stat}
 */
export const rating = {
  id: 'rating',
  subjects: ['player'],
  kind: 'number',
  compute({ rated }, { name }) {
    if (!rated.gamesPlayed.get(name)) return null;
    return { value: ratingOf(rated, name), format: 'rating', ...(isProvisional(rated, name) && { marker: 'provisional' }) };
  },
};
