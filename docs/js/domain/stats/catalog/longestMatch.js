import { bestOf, recordMatch } from '../aggregate.js';

/**
 * Match with the most games (finished or not); tie → most recent. A long match belongs to both
 * teams, so there are no holders; the card shows the match (both teams and the score).
 * @type {import('../registry.js').Stat}
 */
export const longestMatch = {
  id: 'longestMatch',
  subjects: ['overall'],
  kind: 'record',
  compute(facts) {
    const match = bestOf(facts.matches, (a, b) => a.games.length - b.games.length);
    if (!match) return null;
    return { value: match.games.length, format: 'int', holders: [], match: recordMatch(match), date: match.date, matchId: match.matchId };
  },
};
