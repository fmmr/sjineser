import { topWinners } from '../aggregate.js';

/** Finished in three games: necessarily 3–0 without draws. */
const isCleanSweep = ({ complete, games }) => complete && games.length === 3;

/**
 * Number of finished sets won 3–0 without draws, ranked by the players who won most of them.
 * @type {import('../registry.js').Stat}
 */
export const cleanSweeps = {
  id: 'cleanSweeps',
  subjects: ['overall'],
  kind: 'record',
  compute(facts) {
    const sweeps = facts.matches.filter(isCleanSweep);
    if (sweeps.length === 0) return null;
    return { value: sweeps.length, format: 'int', holders: [], ranking: topWinners(sweeps) };
  },
};
