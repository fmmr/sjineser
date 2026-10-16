import { formatDate, formatDateLong } from '../../../i18n/nb.js';

const SIGNED = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0, signDisplay: 'exceptZero' });

/** Norwegian number formats for stat values (formats from domain/stats/kinds.js). */
const FORMATS = {
  int: new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }),
  percent: new Intl.NumberFormat('nb-NO', { style: 'percent', maximumFractionDigits: 0 }),
  rating: new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0, useGrouping: false }),
  signed: SIGNED,
  decimal: new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  /** A fraction as signed percentage points without a % sign: 0.083 → '+8'. */
  signedPercent: { format: (value) => SIGNED.format(value * 100) },
};

/**
 * @param {number} value percent is 0–1, signedPercent −1 … 1
 * @param {import('../../../domain/stats/kinds.js').NumberFormat} format
 * @returns {string} e.g. '46 %', '+13', '1013', '+8' (signedPercent 0.083)
 */
export const formatValue = (value, format) => (Object.hasOwn(FORMATS, format) ? FORMATS[format].format(value) : String(value));

/**
 * Date labels for a chart: short ("14. okt.") when all dates are in one calendar year,
 * with the year ("14. okt. 2025") otherwise.
 * @param {string[]} dates YYYY-MM-DD
 * @returns {(iso: string) => string}
 */
export const chartDateFormat = (dates) =>
  (new Set(dates.map((date) => date.slice(0, 4))).size > 1 ? formatDateLong : formatDate);
