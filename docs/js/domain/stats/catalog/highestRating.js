import { bestOf, settledRows } from '../aggregate.js';

/**
 * The highest rating anyone had after a game in the period, provisional games left out (a
 * player's first PROVISIONAL_GAMES games ever); tie → most recent. Null when none qualifies.
 * @type {import('../registry.js').Stat}
 */
export const highestRating = {
  id: 'highestRating',
  subjects: ['overall'],
  kind: 'record',
  compute(facts) {
    const row = bestOf(settledRows(facts), (a, b) => a.ratingAfter - b.ratingAfter);
    if (!row) return null;
    return { value: row.ratingAfter, format: 'rating', holders: [row.player], date: row.date, matchId: row.matchId };
  },
};
