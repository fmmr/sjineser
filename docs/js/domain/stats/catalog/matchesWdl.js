import { subjectMatches } from '../aggregate.js';

/** Finished matches won and lost by the player or pair (D is always 0). @type {import('../registry.js').Stat} */
export const matchesWdl = {
  id: 'matchesWdl',
  subjects: ['player', 'pair'],
  kind: 'wdl',
  compute(facts, subject) {
    const { won, lost } = subjectMatches(facts, subject);
    return won + lost > 0 ? { W: won, D: 0, L: lost } : null;
  },
};
