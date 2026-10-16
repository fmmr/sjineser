import { playedNights } from '../aggregate.js';

/** Played nights in the period the player was there; null if none. @type {import('../registry.js').Stat} */
export const nightsAttended = {
  id: 'nightsAttended',
  subjects: ['player'],
  kind: 'number',
  compute(facts, { name }) {
    const attended = playedNights(facts).filter((n) => n.players.includes(name)).length;
    return attended > 0 ? { value: attended, format: 'int' } : null;
  },
};
