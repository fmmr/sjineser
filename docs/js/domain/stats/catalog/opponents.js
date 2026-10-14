import { wdlBy, wdlColumns } from '../aggregate.js';
import { compareSubject, playerRows } from '../subjects.js';

/** The player's results against each individual opponent, most games first. @type {import('../registry.js').Stat} */
export const opponents = {
  id: 'opponents',
  subjects: ['player'],
  kind: 'table',
  compute(facts, { name }) {
    const groups = wdlBy(playerRows(facts, name), (r) => r.opponents);
    if (groups.length === 0) return null;
    return {
      columns: wdlColumns('opponent', 'player'),
      rows: groups.map(({ key, ...wdl }) => ({ opponent: key, ...wdl, subject: compareSubject(name, key) })),
    };
  },
};
