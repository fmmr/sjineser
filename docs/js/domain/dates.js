/**
 * @param {Date} date
 * @returns {string} YYYY-MM-DD in local time
 */
export function toISODate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** @param {string} value */
export const isISODate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);

/**
 * Adds days to a YYYY-MM-DD date. UTC, so daylight saving never shifts the day.
 * @param {string} date @param {number} days
 * @returns {string} YYYY-MM-DD
 */
export function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
