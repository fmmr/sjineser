import { matchHolders } from '../aggregate.js';

/** Finished in three games: necessarily 3–0 without draws. */
const isCleanSweep = ({ complete, games }) => complete && games.length === 3;

/** Finished matches won 3–0 without draws; holders = the most recent sweep. @type {import('../registry.js').Stat} */
export const cleanSweeps = {
  id: 'cleanSweeps',
  subjects: ['overall'],
  kind: 'record',
  compute(facts) {
    const sweeps = facts.matches.filter(isCleanSweep);
    const latest = sweeps.at(-1);
    if (!latest) return null;
    return { value: sweeps.length, format: 'int', holders: matchHolders(latest), date: latest.date, matchId: latest.matchId };
  },
};
