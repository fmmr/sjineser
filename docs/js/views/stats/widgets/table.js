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

/** Row subjects carried by a cell of another format than player/pair: a night by its date. */
const ROW_LINK_FORMATS = { night: ['date'] };

/**
 * The cell that links to the row's subject: the first date cell for a night, else the first
 * player/pair cell (e.g. a partner → the pair). Null without a subject or a fitting cell.
 * @param {{ key: string, format: string }[]} columns
 * @param {{ subject?: { type: string } }} row
 * @returns {string | null}
 */
export function rowLinkKey(columns, row) {
  if (!row.subject) return null;
  const formats = ROW_LINK_FORMATS[row.subject.type] ?? LINK_FORMATS;
  return columns.find((c) => formats.includes(c.format))?.key ?? null;
}

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
const TEXT_FORMATS = [...LINK_FORMATS, 'label', 'date', 'players', 'form', 'season'];

/**
 * Text of a cell; pairs read "Anne & Bjørn", player lists "Anne, Bjørn og Cato", dates
 * "14. okt. 2025", labels come from t.statsLabels, form reads "SSUT" (– without games), seasons "Vår 2026".
 * @param {unknown} value @param {string} format
 */
/** "Anne, Bjørn og Cato" with each name linking to the player page. */
function linkedNames(names, query) {
  return names.flatMap((name, i) => [
    t.nameSeparator(i, names.length) || null,
    h('a', { class: 'link', href: statsHref(subjectPath(playerSubject(name)), query) }, name),
  ]);
}

export function cellText(value, format) {
  if (format === 'player') return value;
  if (format === 'pair') return t.statsUi.pair(value[0], value[1]);
  if (format === 'label') return t.statsLabels[value] ?? value;
  if (format === 'date') return formatDateLong(value);
  if (format === 'season') return t.statsUi.season(value);
  if (format === 'players') return t.names(value);
  if (format === 'countShare') return `${formatValue(value.count, 'int')} (${formatValue(value.share, 'percent')})`;
  if (format === 'form') return value.length > 0 ? formLetters(value).join('') : t.statsUi.none;
  if (value === null) return t.statsUi.none;
  return formatValue(value, format);
}

/**
 * A stat table. The row's subject is linked from one cell (rowLinkKey: e.g. a partner → the
 * pair, a night's date → the night page); other player/pair cells link to their own page. Rows marked `provisional` get the "ny"
 * marker after the rating; ranks get a small marker (top three slightly brighter).
 * @param {{ columns: { key: string, format: string }[], rows: object[] }} value
 * @param {{ query: Record<string, string> }} ctx
 */
export function tableBody({ columns, rows }, { query }) {
  const isNumber = (format) => !TEXT_FORMATS.includes(format);

  const cell = (row, { key, format }, linkKey) => {
    const text = cellText(row[key], format);
    let content = text;
    const subject = key === linkKey ? row.subject : LINK_FORMATS.includes(format) ? cellSubject(row[key], format) : null;
    if (subject) content = h('a', { class: 'link', href: statsHref(subjectPath(subject), query) }, text);
    if (format === 'form' && row[key].length > 0) content = formStrip(row[key], { compact: true });
    if (format === 'players') content = linkedNames(row[key], query);
    if (format === 'countShare') {
      content = [formatValue(row[key].count, 'int'), ' ', h('span', { class: 'cell-share' }, `(${formatValue(row[key].share, 'percent')})`)];
    }
    if (key === 'rank') content = h('span', { class: 'stat-rank', 'data-rank': String(row[key]) }, text);
    const className = isNumber(format) ? 'num' : format === 'players' ? 'names' : null;
    return h('td', { class: className, 'data-col': key, 'data-sign': signOf(row[key], format) },
      content, format === 'rating' && row.provisional && provisionalMarker());
  };

  return h('div', { class: 'stat-table-wrap' },
    h('table', { class: 'stat-table' },
      h('thead', {}, h('tr', {}, columns.map(({ key, format }) =>
        h('th', { scope: 'col', class: isNumber(format) ? 'num' : null, 'data-col': key }, header(key))))),
      h('tbody', {}, rows.map((row) => {
        const linkKey = rowLinkKey(columns, row);
        return h('tr', {}, columns.map((column) => cell(row, column, linkKey)));
      }))));
}

/** @returns {{ el: HTMLElement }} */
export const renderTable = (stat, value, ctx) =>
  ({ el: statTile(stat, value && tableBody(value, ctx), { wide: true, hideTitle: ctx.hideTitle }) });
