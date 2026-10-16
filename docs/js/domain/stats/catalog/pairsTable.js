import { byName } from '../../players.js';
import { wdlBy, wdlColumns } from '../aggregate.js';
import { isPairRow, pairKey, pairSubject, parsePairKey } from '../subjects.js';

/** Every pair (2-player team) with games in scope, most games first. @type {import('../registry.js').Stat} */
export const pairsTable = {
  id: 'pairsTable',
  subjects: ['overall'],
  kind: 'table',
  compute(facts) {
    // One row per pair and game: the first partner's row by name. Teams of three are not pairs.
    const rows = facts.rows.filter((r) => isPairRow(r) && byName(r.player, r.partners[0]) < 0);
    const groups = wdlBy(rows, (r) => [pairKey([r.player, r.partners[0]])]);
    if (groups.length === 0) return null;
    return {
      columns: wdlColumns('pair', 'pair'),
      rows: groups.map(({ key, ...wdl }) => {
        const names = parsePairKey(key);
        return { pair: names, ...wdl, subject: pairSubject(...names) };
      }),
    };
  },
};
