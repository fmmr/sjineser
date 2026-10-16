import { matchHolders, recordMatch } from '../aggregate.js';

/** Finished, won 3–2, and the loser won the first two decided games (draws in between allowed). */
function isComeback({ complete, winner, games }) {
  if (!complete) return false;
  const decided = games.filter((g) => g.result !== 'D');
  return decided.length === 5 && decided[0].result !== winner && decided[1].result !== winner;
}

/** Finished matches won 3–2 after trailing 0–2; holders = the most recent. @type {import('../registry.js').Stat} */
export const comebacks = {
  id: 'comebacks',
  subjects: ['overall'],
  kind: 'record',
  compute(facts) {
    const found = facts.matches.filter(isComeback);
    const latest = found.at(-1);
    if (!latest) return null;
    return { value: found.length, format: 'int', holders: matchHolders(latest), match: recordMatch(latest), date: latest.date, matchId: latest.matchId };
  },
};
