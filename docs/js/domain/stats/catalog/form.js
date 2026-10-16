import { FORM_GAMES } from '../constants.js';
import { lastOutcomes } from '../aggregate.js';
import { playerRows } from '../subjects.js';

/**
 * The player's last FORM_GAMES games in the period, oldest first; fewer when fewer are played.
 * @type {import('../registry.js').Stat}
 */
export const form = {
  id: 'form',
  subjects: ['player'],
  kind: 'form',
  compute(facts, { name }) {
    const rows = playerRows(facts, name);
    return rows.length > 0 ? { outcomes: lastOutcomes(rows, FORM_GAMES) } : null;
  },
};
