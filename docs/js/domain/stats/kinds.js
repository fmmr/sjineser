import { isISODate } from '../dates.js';
import { isValidMatchId } from '../match.js';
import { isValidSubject } from './subjects.js';

/**
 * Value kinds a stat can return (spec §9). Each kind has one generic widget.
 * @typedef {'number' | 'wdl' | 'table' | 'record' | 'chart'} Kind
 * @typedef {'int' | 'percent' | 'rating' | 'signed' | 'decimal'} NumberFormat percent is 0–1; signed shows +/−
 * @typedef {NumberFormat | 'player' | 'pair' | 'label'} TableFormat label: an i18n key under t.statsLabels
 */

/** @type {Kind[]} */
export const KINDS = ['number', 'wdl', 'table', 'record', 'chart'];

/** @type {NumberFormat[]} */
export const NUMBER_FORMATS = ['int', 'percent', 'rating', 'signed', 'decimal'];

/** @type {TableFormat[]} */
export const TABLE_FORMATS = [...NUMBER_FORMATS, 'player', 'pair', 'label'];

const MARKERS = ['provisional'];
const WDL_KEYS = ['W', 'D', 'L'];

const isObject = (value) => typeof value === 'object' && value !== null;
const isCount = (value) => Number.isInteger(value) && value >= 0;
const isName = (value) => typeof value === 'string' && value !== '';
const isOptional = (value, check) => value === undefined || check(value);

/** A number that fits its format: int → integer, percent → 0–1, the rest → any finite number. */
function isFormattedNumber(value, format) {
  if (!Number.isFinite(value) || !NUMBER_FORMATS.includes(format)) return false;
  if (format === 'int') return Number.isInteger(value);
  if (format === 'percent') return value >= 0 && value <= 1;
  return true;
}

const CELL_CHECKS = {
  player: isName,
  pair: (value) => Array.isArray(value) && value.length === 2 && value.every(isName),
  label: isName,
};

const isCell = (value, format) =>
  (Object.hasOwn(CELL_CHECKS, format) ? CELL_CHECKS[format](value) : isFormattedNumber(value, format));

const isColumns = (columns) => Array.isArray(columns) && columns.length > 0
  && columns.every((c) => isObject(c) && isName(c.key) && TABLE_FORMATS.includes(c.format))
  && new Set(columns.map((c) => c.key)).size === columns.length;

const VALUE_CHECKS = {
  number: ({ value, format, marker }) => isFormattedNumber(value, format) && isOptional(marker, (m) => MARKERS.includes(m)),

  wdl: (value) => WDL_KEYS.every((key) => isCount(value[key])),

  table: ({ columns, rows }) => isColumns(columns) && Array.isArray(rows) && rows.every((row) => isObject(row)
    && columns.every(({ key, format }) => isCell(row[key], format))
    && isOptional(row.subject, isValidSubject)),

  record: ({ value, format, holders, date, matchId }) => isFormattedNumber(value, format)
    && Array.isArray(holders) && holders.every(isName)
    && isOptional(date, isISODate) && isOptional(matchId, isValidMatchId),

  chart: ({ series }) => Array.isArray(series) && series.length > 0 && series.every((s) => isObject(s)
    && isName(s.name) && Array.isArray(s.points)
    && s.points.every((p) => isObject(p) && isISODate(p.x) && Number.isFinite(p.y))),
};

/**
 * Whether `value` has the shape of `kind` (the stats contract). null is never valid here;
 * "not enough data" is checked separately.
 * @param {Kind} kind
 * @param {unknown} value
 */
export const isValidValue = (kind, value) =>
  Object.hasOwn(VALUE_CHECKS, kind) && isObject(value) && VALUE_CHECKS[kind](value);
