/** @typedef {{ year: number, half: 1 | 2 }} Season half 1 = January–June, half 2 = July–December */

/** @param {string} date YYYY-MM-DD @returns {Season} */
export function seasonOf(date) {
  const [year, month] = date.split('-').map(Number);
  return { year, half: month <= 6 ? 1 : 2 };
}

/** @param {string} date @param {Season} season */
export function inSeason(date, season) {
  const other = seasonOf(date);
  return other.year === season.year && other.half === season.half;
}
