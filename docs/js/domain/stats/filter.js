import { inSeason, seasonOf } from '../season.js';

/**
 * Filter for stats. Seasons are kept in the URL as `all` or `2026-2`; a night filter (one
 * night's games, spec §9) comes from the night page's route, never from `s`.
 * @typedef {{ kind: 'all' } | { kind: 'season', year: number, half: 1 | 2 } | { kind: 'night', date: string }} Filter
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

/** One night's games (the night page). @param {string} date YYYY-MM-DD @returns {Filter} */
export const nightFilter = (date) => ({ kind: 'night', date });

/**
 * 'all', '2026-2', or 'n:2026-10-13' for a night (a cache key only; parseFilter reads seasons).
 * @param {Filter} filter @returns {string}
 */
export function formatFilter(filter) {
  if (filter.kind === 'all') return 'all';
  if (filter.kind === 'night') return `n:${filter.date}`;
  return `${filter.year}-${filter.half}`;
}

/** @param {string} date YYYY-MM-DD @param {Filter} filter */
export function inFilter(date, filter) {
  if (filter.kind === 'all') return true;
  if (filter.kind === 'night') return date === filter.date;
  return inSeason(date, filter);
}

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
