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
