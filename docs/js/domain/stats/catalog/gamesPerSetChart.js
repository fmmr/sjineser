import { playedNights } from '../aggregate.js';

/**
 * Average games per set (sets with games) on each played night in the period; null with fewer
 * than 2 played nights (one point is not a trend). @type {import('../registry.js').Stat}
 */
export const gamesPerSetChart = {
  id: 'gamesPerSetChart',
  subjects: ['overall'],
  kind: 'chart',
  compute(facts) {
    const nights = playedNights(facts);
    if (nights.length < 2) return null;
    const points = nights.map(({ date, matches }) => ({
      x: date,
      y: matches.reduce((sum, m) => sum + m.games.length, 0) / matches.length,
    }));
    return { series: [{ label: 'series_gamesPerSet', points }], format: 'decimal' };
  },
};
