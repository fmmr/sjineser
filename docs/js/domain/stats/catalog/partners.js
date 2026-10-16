import { wdlBy, wdlColumns } from '../aggregate.js';
import { compareSubject, pairRows, pairSubject, playerRows } from '../subjects.js';

/**
 * The player's results with each teammate, most games first. Every teammate counts, on teams
 * of two and three alike. A row links to the pair page when the two have played as a 2-player
 * team in scope, otherwise to compare (whose "together" counts any team size).
 * @type {import('../registry.js').Stat}
 */
export const partners = {
  id: 'partners',
  subjects: ['player'],
  kind: 'table',
  compute(facts, { name }) {
    const groups = wdlBy(playerRows(facts, name), (r) => r.partners);
    const subjectOf = (partner) => (pairRows(facts, [name, partner]).length > 0
      ? pairSubject(name, partner)
      : compareSubject(name, partner));
    if (groups.length === 0) return null;
    return {
      columns: wdlColumns('partner', 'player'),
      rows: groups.map(({ key, ...wdl }) => ({ partner: key, ...wdl, subject: subjectOf(key) })),
    };
  },
};
