/** Norwegian number formats for stat values (formats from domain/stats/kinds.js). */
const FORMATS = {
  int: new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }),
  percent: new Intl.NumberFormat('nb-NO', { style: 'percent', maximumFractionDigits: 0 }),
  rating: new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0, useGrouping: false }),
  signed: new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0, signDisplay: 'exceptZero' }),
  decimal: new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
};

/**
 * @param {number} value percent is 0–1
 * @param {import('../../../domain/stats/kinds.js').NumberFormat} format
 * @returns {string} e.g. '46 %', '+13', '1013'
 */
export const formatValue = (value, format) => (Object.hasOwn(FORMATS, format) ? FORMATS[format].format(value) : String(value));
