import { seasonWinners } from './seasonPlayers.js';

/**
 * Seasons the player won as Sesongens spiller: the count, and the seasons newest first. Only
 * over all seasons (see seasonWinners); null when the player won none.
 * @type {import('../registry.js').Stat}
 */
export const seasonTitles = {
  id: 'seasonTitles',
  subjects: ['player'],
  kind: 'record',
  compute(facts, { name }) {
    const seasons = seasonWinners(facts).filter((w) => w.player === name).map((w) => w.season);
    return seasons.length > 0 ? { value: seasons.length, format: 'int', holders: [], seasons } : null;
  },
};
