import { bestOf, settledRows } from '../aggregate.js';

/**
 * The lowest rating anyone had after a game in the period, provisional games left out (a
 * player's first PROVISIONAL_GAMES games ever); tie → most recent. Null when none qualifies.
 * @type {import('../registry.js').Stat}
 */
export const lowestRating = {
  id: 'lowestRating',
  subjects: ['overall'],
  kind: 'record',
  compute(facts) {
    const row = bestOf(settledRows(facts), (a, b) => b.ratingAfter - a.ratingAfter);
    if (!row) return null;
    return { value: row.ratingAfter, format: 'rating', holders: [row.player], date: row.date, matchId: row.matchId };
  },
};
