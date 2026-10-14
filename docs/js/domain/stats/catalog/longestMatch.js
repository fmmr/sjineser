import { bestOf, matchHolders } from '../aggregate.js';

/** Match with the most games (finished or not); tie → most recent. @type {import('../registry.js').Stat} */
export const longestMatch = {
  id: 'longestMatch',
  subjects: ['overall'],
  kind: 'record',
  compute(facts) {
    const match = bestOf(facts.matches, (a, b) => a.games.length - b.games.length);
    if (!match) return null;
    return { value: match.games.length, format: 'int', holders: matchHolders(match), date: match.date, matchId: match.matchId };
  },
};
