import { wdlBy, wdlColumns } from '../aggregate.js';
import { pairSubject, playerRows } from '../subjects.js';

/** The player's results with each partner, most games first. @type {import('../registry.js').Stat} */
export const partners = {
  id: 'partners',
  subjects: ['player'],
  kind: 'table',
  compute(facts, { name }) {
    const groups = wdlBy(playerRows(facts, name), (r) => [r.partner]);
    if (groups.length === 0) return null;
    return {
      columns: wdlColumns('partner', 'player'),
      rows: groups.map(({ key, ...wdl }) => ({ partner: key, ...wdl, subject: pairSubject(name, key) })),
    };
  },
};
