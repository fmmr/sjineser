import { bestOf, matchHolders, recordMatch } from '../aggregate.js';

/**
 * Team-rating gap (losers − winners) at the start of a finished set, from the ratings before
 * its first game; > 0 means the lower-rated team won the set.
 * @param {import('../facts.js').MatchFact} match
 */
function gapOf({ winner, games: [first] }) {
  return winner === 'A' ? first.ratingB - first.ratingA : first.ratingA - first.ratingB;
}

/**
 * The finished set won by the team with the lowest rating at the start of the set, relative to
 * the losers; tie → most recent; null when every set was won by the higher-rated team.
 * Per set rather than per game: a single game won inside a lost set is not an upset.
 * @type {import('../registry.js').Stat}
 */
export const biggestUpset = {
  id: 'biggestUpset',
  subjects: ['overall'],
  kind: 'record',
  compute(facts) {
    const upsets = facts.matches.filter((m) => m.complete && gapOf(m) > 0);
    const match = bestOf(upsets, (a, b) => gapOf(a) - gapOf(b));
    if (!match) return null;
    return {
      value: gapOf(match), format: 'rating', holders: matchHolders(match), match: recordMatch(match),
      date: match.date, matchId: match.matchId,
    };
  },
};
