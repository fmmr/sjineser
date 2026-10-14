import { subjectMatches } from '../aggregate.js';

/** Share of the player's or pair's finished matches won. @type {import('../registry.js').Stat} */
export const matchWinRate = {
  id: 'matchWinRate',
  subjects: ['player', 'pair'],
  kind: 'number',
  compute(facts, subject) {
    const { won, lost } = subjectMatches(facts, subject);
    return won + lost > 0 ? { value: won / (won + lost), format: 'percent' } : null;
  },
};
