import { inSeason, seasonOf } from '../season.js';

/**
 * Season filter for stats, kept in the URL as `all` or `2026-2`.
 * @typedef {{ kind: 'all' } | { kind: 'season', year: number, half: 1 | 2 }} Filter
 */

/** @param {import('../season.js').Season} season @returns {Filter} */
const seasonFilter = ({ year, half }) => ({ kind: 'season', year, half });

/**
 * @param {string | null | undefined} text 'all', 'YYYY-1' or 'YYYY-2'
 * @param {string} today YYYY-MM-DD; missing or invalid text → the season of today
 * @returns {Filter}
 */
export function parseFilter(text, today) {
  if (text === 'all') return { kind: 'all' };
  const found = /^(\d{4})-([12])$/.exec(text ?? '');
  return seasonFilter(found ? { year: Number(found[1]), half: Number(found[2]) } : seasonOf(today));
}

/** @param {Filter} filter @returns {string} */
export const formatFilter = (filter) => (filter.kind === 'all' ? 'all' : `${filter.year}-${filter.half}`);

/** @param {string} date YYYY-MM-DD @param {Filter} filter */
export const inFilter = (date, filter) => filter.kind === 'all' || inSeason(date, filter);

/**
 * Distinct seasons of all nights plus the current one, newest first.
 * @param {import('../match.js').Dataset} dataset
 * @param {string} today YYYY-MM-DD
 * @returns {Filter[]} season filters only
 */
export function seasonsIn(dataset, today) {
  const texts = new Set([today, ...dataset.nights.map((n) => n.date)].map((date) => formatFilter(seasonFilter(seasonOf(date)))));
  return [...texts].sort().reverse().map((text) => parseFilter(text, today));
}
