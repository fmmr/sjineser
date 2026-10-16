import { bestOf, settledRows } from '../aggregate.js';

/**
 * The player's lowest rating after a game in the period, provisional games left out (their
 * first PROVISIONAL_GAMES games ever); tie → most recent. No holders: the page is the player's.
 * @type {import('../registry.js').Stat}
 */
export const lowRating = {
  id: 'lowRating',
  subjects: ['player'],
  kind: 'record',
  compute(facts, { name }) {
    const rows = settledRows(facts).filter((r) => r.player === name);
    const row = bestOf(rows, (a, b) => b.ratingAfter - a.ratingAfter);
    if (!row) return null;
    return { value: row.ratingAfter, format: 'rating', holders: [], date: row.date };
  },
};
