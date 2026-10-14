import { buildFacts } from '../../domain/stats/facts.js';
import { formatFilter } from '../../domain/stats/filter.js';

let last = null;

/**
 * buildFacts, recomputed only when the dataset identity (store.get()) or the filter changes.
 * Shared by all stats views, so moving between pages with the same filter is free.
 * @param {import('../../domain/match.js').Dataset} dataset
 * @param {import('../../domain/stats/filter.js').Filter} filter
 * @returns {import('../../domain/stats/facts.js').Facts}
 */
export function factsFor(dataset, filter) {
  const key = formatFilter(filter);
  if (last?.dataset !== dataset || last.key !== key) last = { dataset, key, facts: buildFacts(dataset, filter) };
  return last.facts;
}
