import { h } from '../../components/dom.js';
import { formatDateLong, t } from '../../../i18n/nb.js';
import { pairSubject, playerSubject } from '../../../domain/stats/subjects.js';
import { statsHref, subjectPath } from '../links.js';
import { formatValue } from './format.js';
import { formLetters, formStrip } from './form.js';
import { provisionalMarker, statTile } from './tile.js';

/** Column header; abbreviated ones (S/U/T) carry their full name as a tooltip. */
const header = (key) => (Object.hasOwn(t.statsColumnTitles, key)
  ? h('abbr', { title: t.statsColumnTitles[key] }, t.statsColumns[key])
  : t.statsColumns[key] ?? key);

const LINK_FORMATS = ['player', 'pair'];

/** The subject a player or pair cell stands for. */
const cellSubject = (value, format) => (format === 'player' ? playerSubject(value) : pairSubject(...value));

/** Signed formats and the factor to their shown, rounded unit. */
const SIGNED_SCALE = { signed: 1, signedPercent: 100 };

/**
 * Styling hook for signed numbers (e.g. rating change): 'up', 'down', or null for other formats
 * and for values that are shown as 0 after rounding.
 * @param {number | null} value @param {string} format
 */
export function signOf(value, format) {
  if (!Object.hasOwn(SIGNED_SCALE, format) || value === null) return null;
  const shown = Math.round(value * SIGNED_SCALE[format]);
  return shown > 0 ? 'up' : shown < 0 ? 'down' : null;
}

/** Formats that are not numbers: left-aligned, never signed. */
const TEXT_FORMATS = [...LINK_FORMATS, 'label', 'date', 'players', 'form'];

/**
 * Text of a cell; pairs read "Anne & Bjørn", player lists "Anne, Bjørn og Cato", dates
 * "14. okt. 2025", labels come from t.statsLabels, form reads "SSUT" (– without games).
 * @param {unknown} value @param {string} format
 */
export function cellText(value, format) {
  if (format === 'player') return value;
  if (format === 'pair') return t.statsUi.pair(value[0], value[1]);
  if (format === 'label') return t.statsLabels[value] ?? value;
  if (format === 'date') return formatDateLong(value);
  if (format === 'players') return t.names(value);
  if (format === 'form') return value.length > 0 ? formLetters(value).join('') : t.statsUi.none;
  if (value === null) return t.statsUi.none;
  return formatValue(value, format);
}

/**
 * A stat table. The first player/pair cell links to the row's subject (e.g. a partner → the
 * pair), other player/pair cells to their own page. Rows marked `provisional` get the "ny"
 * marker after the rating; ranks get a small marker (top three slightly brighter).
 * @param {{ columns: { key: string, format: string }[], rows: object[] }} value
 * @param {{ query: Record<string, string> }} ctx
 */
export function tableBody({ columns, rows }, { query }) {
  const linkKey = columns.find((c) => LINK_FORMATS.includes(c.format))?.key;
  const isNumber = (format) => !TEXT_FORMATS.includes(format);

  const cell = (row, { key, format }) => {
    const text = cellText(row[key], format);
    let content = text;
    if (LINK_FORMATS.includes(format)) {
      const subject = key === linkKey && row.subject ? row.subject : cellSubject(row[key], format);
      content = h('a', { class: 'link', href: statsHref(subjectPath(subject), query) }, text);
    }
    if (format === 'form' && row[key].length > 0) content = formStrip(row[key], { compact: true });
    if (key === 'rank') content = h('span', { class: 'stat-rank', 'data-rank': String(row[key]) }, text);
    const className = isNumber(format) ? 'num' : format === 'players' ? 'names' : null;
    return h('td', { class: className, 'data-col': key, 'data-sign': signOf(row[key], format) },
      content, format === 'rating' && row.provisional && provisionalMarker());
  };

  return h('div', { class: 'stat-table-wrap' },
    h('table', { class: 'stat-table' },
      h('thead', {}, h('tr', {}, columns.map(({ key, format }) =>
        h('th', { scope: 'col', class: isNumber(format) ? 'num' : null, 'data-col': key }, header(key))))),
      h('tbody', {}, rows.map((row) => h('tr', {}, columns.map((column) => cell(row, column)))))));
}

/** @returns {{ el: HTMLElement }} */
export const renderTable = (stat, value, ctx) =>
  ({ el: statTile(stat, value && tableBody(value, ctx), { wide: true, hideTitle: ctx.hideTitle }) });
