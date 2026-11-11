import { buildFacts } from '../../domain/stats/facts.js';
import { formatFilter } from '../../domain/stats/filter.js';

let last = null;

/**
 * buildFacts, recomputed only when the dataset identity (store.get()), the filter or the clock
 * (today and hour: whether the latest night is still ongoing) changes. Shared by all stats views,
 * so moving between pages with the same filter is free.
 * @param {import('../../domain/match.js').Dataset} dataset
 * @param {import('../../domain/stats/filter.js').Filter} filter
 * @param {{ today?: string, hour?: number }} [clock]
 * @returns {import('../../domain/stats/facts.js').Facts}
 */
export function factsFor(dataset, filter, clock = {}) {
  const key = `${formatFilter(filter)}|${clock.today ?? ''}|${clock.hour ?? ''}`;
  if (last?.dataset !== dataset || last.key !== key) last = { dataset, key, facts: buildFacts(dataset, filter, clock) };
  return last.facts;
}
