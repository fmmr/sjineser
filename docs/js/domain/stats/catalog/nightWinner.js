import { bestOf } from '../aggregate.js';
import { nightSummaries } from './nightsList.js';

/**
 * Kveldens vinner: the most rating won on one night in the period, and by whom (the night's
 * winner as in nightsList); tie → most recent. On the night page it is that night's winner.
 * Null when nobody gained (e.g. only draws between equal teams).
 * @type {import('../registry.js').Stat}
 */
export const nightWinner = {
  id: 'nightWinner',
  subjects: ['overall'],
  kind: 'record',
  compute(facts) {
    // nightSummaries is newest first; bestOf keeps the last of equals, so go oldest first.
    const night = bestOf(nightSummaries(facts).reverse(), (a, b) => a.winnerGain - b.winnerGain);
    if (!night || night.winnerGain <= 0) return null;
    return { value: night.winnerGain, format: 'signed', holders: [night.winner], date: night.date };
  },
};
