import { bestOf, recordMatch } from '../aggregate.js';

/**
 * Match with the most drawn games (finished or not); tie → most recent; null without any draw.
 * The set belongs to both teams, so there are no holders; the card shows the match and its score.
 * @type {import('../registry.js').Stat}
 */
export const mostDrawsInSet = {
  id: 'mostDrawsInSet',
  subjects: ['overall'],
  kind: 'record',
  compute(facts) {
    const match = bestOf(facts.matches.filter((m) => m.score.D > 0), (a, b) => a.score.D - b.score.D);
    if (!match) return null;
    return { value: match.score.D, format: 'int', holders: [], match: recordMatch(match), date: match.date, matchId: match.matchId };
  },
};
