import { wdlBy, wdlColumns } from '../aggregate.js';
import { pairKey, pairRows, pairSubject, parsePairKey } from '../subjects.js';

/**
 * The pair's results against each opposing pair, most games first. Pairs are 2-player teams:
 * games against a team of three count in the pair's results but are not listed here.
 * @type {import('../registry.js').Stat}
 */
export const pairVsPairs = {
  id: 'pairVsPairs',
  subjects: ['pair'],
  kind: 'table',
  compute(facts, { names }) {
    const rows = pairRows(facts, names).filter((r) => r.opponents.length === 2);
    const groups = wdlBy(rows, (r) => [pairKey(r.opponents)]);
    if (groups.length === 0) return null;
    return {
      columns: wdlColumns('pair', 'pair'),
      rows: groups.map(({ key, ...wdl }) => {
        const opponents = parsePairKey(key);
        return { pair: opponents, ...wdl, subject: pairSubject(...opponents) };
      }),
    };
  },
};
