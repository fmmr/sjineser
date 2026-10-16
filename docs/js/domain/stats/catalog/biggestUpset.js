import { bestOf } from '../aggregate.js';

/** Pre-game team-rating gap (losers − winners) of a decided game; ≤ 0 when the favourite won. */
const gapOf = (game) => (game.result === 'A' ? game.ratingB - game.ratingA : game.ratingA - game.ratingB);

/**
 * The game won by the team with the lowest pre-game rating relative to the losers;
 * tie → most recent; null when no game was won by the lower-rated team.
 * @type {import('../registry.js').Stat}
 */
export const biggestUpset = {
  id: 'biggestUpset',
  subjects: ['overall'],
  kind: 'record',
  compute(facts) {
    const upsets = facts.games.filter((g) => g.result !== 'D' && gapOf(g) > 0);
    const game = bestOf(upsets, (a, b) => gapOf(a) - gapOf(b));
    if (!game) return null;
    const losers = game.result === 'A' ? 'B' : 'A';
    return {
      value: gapOf(game), format: 'rating', holders: [...game[game.result]],
      match: { A: [...game[game.result]], B: [...game[losers]] }, date: game.date, matchId: game.matchId,
    };
  },
};
