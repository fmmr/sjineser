import { playedNights } from '../aggregate.js';

/**
 * Share of games drawn on each played night in the period (0–1); null with fewer than 2 played
 * nights (one point is not a trend). @type {import('../registry.js').Stat}
 */
export const drawRateChart = {
  id: 'drawRateChart',
  subjects: ['overall'],
  kind: 'chart',
  compute(facts) {
    const nights = playedNights(facts);
    if (nights.length < 2) return null;
    const points = nights.map(({ date, matches }) => {
      const results = matches.flatMap((m) => m.games.map((g) => g.result));
      return { x: date, y: results.filter((r) => r === 'D').length / results.length };
    });
    return { series: [{ label: 'series_drawRate', points }], format: 'percent' };
  },
};
