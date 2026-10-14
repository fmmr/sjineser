import { subjectRows, wdlOf } from '../aggregate.js';

/** Games won, drawn and lost by the player or pair. @type {import('../registry.js').Stat} */
export const gamesWdl = {
  id: 'gamesWdl',
  subjects: ['player', 'pair'],
  kind: 'wdl',
  compute(facts, subject) {
    const rows = subjectRows(facts, subject);
    return rows.length > 0 ? wdlOf(rows) : null;
  },
};
