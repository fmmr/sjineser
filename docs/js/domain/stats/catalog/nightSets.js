import { parseMatchId } from '../../match.js';

/**
 * Sett: every set in the period with games, in play order, as a small scoreboard each (number,
 * teams, score, winner; unfinished sets have no winner). Meant for the night page, where the
 * period is one night.
 * @type {import('../registry.js').Stat}
 */
export const nightSets = {
  id: 'nightSets',
  subjects: ['overall'],
  kind: 'sets',
  compute(facts) {
    if (facts.matches.length === 0) return null;
    return {
      sets: facts.matches.map(({ matchId, A, B, score, winner, complete }) => ({
        matchId, number: parseMatchId(matchId).number, A: [...A], B: [...B], score: { ...score }, winner, complete,
      })),
    };
  },
};
