import { playerRows } from '../subjects.js';

/** One point per night played in scope: the rating after the player's last game that night. @type {import('../registry.js').Stat} */
export const eloChart = {
  id: 'eloChart',
  subjects: ['player'],
  kind: 'chart',
  compute(facts, { name }) {
    const byNight = new Map();
    for (const row of playerRows(facts, name)) byNight.set(row.date, row.ratingAfter);
    if (byNight.size === 0) return null;
    return { series: [{ name, points: [...byNight].map(([x, y]) => ({ x, y })) }] };
  },
};
