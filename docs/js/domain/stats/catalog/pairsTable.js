import { byName } from '../../players.js';
import { chemistryOf, minGamesFor, wdlBy, wdlColumns } from '../aggregate.js';
import { isPairRow, pairKey, pairSubject, parsePairKey } from '../subjects.js';

/**
 * Every pair (2-player team) with games in scope, most games first, with its kjemi last
 * (null below the minimum games together — none on a night page, see minGamesFor).
 * @type {import('../registry.js').Stat}
 */
export const pairsTable = {
  id: 'pairsTable',
  subjects: ['overall'],
  kind: 'table',
  compute(facts) {
    // One row per pair and game: the first partner's row by name. Teams of three are not pairs.
    const rows = facts.rows.filter((r) => isPairRow(r) && byName(r.player, r.partners[0]) < 0);
    const keyOf = (r) => pairKey([r.player, r.partners[0]]);
    const groups = wdlBy(rows, (r) => [keyOf(r)]);
    if (groups.length === 0) return null;
    const rowsByPair = new Map();
    for (const r of rows) {
      const key = keyOf(r);
      if (!rowsByPair.has(key)) rowsByPair.set(key, []);
      rowsByPair.get(key).push(r);
    }
    return {
      columns: [...wdlColumns('pair', 'pair'), { key: 'chemistry', format: 'signedPercent' }],
      rows: groups.map(({ key, ...wdl }) => {
        const names = parsePairKey(key);
        return { pair: names, ...wdl, chemistry: chemistryOf(rowsByPair.get(key), minGamesFor(facts.filter)), subject: pairSubject(...names) };
      }),
    };
  },
};
