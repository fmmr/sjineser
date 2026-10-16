import { bestOf } from '../aggregate.js';
import { nightSummaries } from './nightsList.js';

/**
 * Night with the most games in the period; holders = everyone who was there (sitting out
 * included); tie → most recent. @type {import('../registry.js').Stat}
 */
export const longestNight = {
  id: 'longestNight',
  subjects: ['overall'],
  kind: 'record',
  compute(facts) {
    // nightSummaries is newest first; bestOf keeps the last of equals, so go oldest first.
    const night = bestOf(nightSummaries(facts).reverse(), (a, b) => a.games - b.games);
    return night ? { value: night.games, format: 'int', holders: night.players, date: night.date } : null;
  },
};
