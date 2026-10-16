import { isISODate } from '../dates.js';
import { isValidMatchId } from '../match.js';
import { isValidSubject } from './subjects.js';
import { FORM_GAMES } from './constants.js';

/**
 * Value kinds a stat can return (spec §9). Each kind has one generic widget.
 * @typedef {'number' | 'wdl' | 'duel' | 'table' | 'record' | 'chart' | 'form' | 'sets' | 'matrix'} Kind
 * @typedef {'int' | 'percent' | 'rating' | 'signed' | 'decimal' | 'signedPercent'} NumberFormat percent is 0–1;
 *   signed shows +/−; signedPercent is a fraction −1 … 1 shown as signed percentage points
 * @typedef {NumberFormat | 'player' | 'pair' | 'label' | 'date' | 'players' | 'form' | 'countShare' | 'season'} TableFormat
 *   label: an i18n key under t.statsLabels; date: 'YYYY-MM-DD'; players: a non-empty list of names; form: 0–FORM_GAMES
 *   outcomes, oldest first ([] = no games in the period); countShare: { count, share }; season: { year, half }
 * Table rows: one cell per column key, plus optional `subject` (the row links to it) and
 * optional boolean `provisional` (the row's rating cell gets the "ny" marker).
 */

/** @type {Kind[]} */
export const KINDS = ['number', 'wdl', 'duel', 'table', 'record', 'chart', 'form', 'sets', 'matrix'];

/** @type {NumberFormat[]} */
export const NUMBER_FORMATS = ['int', 'percent', 'rating', 'signed', 'decimal', 'signedPercent'];

/** @type {TableFormat[]} */
export const TABLE_FORMATS = [...NUMBER_FORMATS, 'player', 'pair', 'label', 'date', 'players', 'form', 'countShare', 'season'];

const MARKERS = ['provisional'];
const WDL_KEYS = ['W', 'D', 'L'];

const isObject = (value) => typeof value === 'object' && value !== null;
const isCount = (value) => Number.isInteger(value) && value >= 0;
const isName = (value) => typeof value === 'string' && value !== '';
const isOptional = (value, check) => value === undefined || check(value);

/** A season (half-year): { year, half } with half 1 or 2. */
const isSeason = (value) => isObject(value) && Number.isInteger(value.year) && [1, 2].includes(value.half);

/** Up to FORM_GAMES outcomes (oldest first); at least `min`. */
const isOutcomes = (value, min) => Array.isArray(value) && value.length >= min && value.length <= FORM_GAMES
  && value.every((outcome) => WDL_KEYS.includes(outcome));

/** A number that fits its format: int → integer, percent → 0–1, signedPercent → −1 … 1, the rest → any finite number. */
function isFormattedNumber(value, format) {
  if (!Number.isFinite(value) || !NUMBER_FORMATS.includes(format)) return false;
  if (format === 'int') return Number.isInteger(value);
  if (format === 'percent') return value >= 0 && value <= 1;
  if (format === 'signedPercent') return value >= -1 && value <= 1;
  return true;
}

const CELL_CHECKS = {
  player: isName,
  pair: (value) => Array.isArray(value) && value.length === 2 && value.every(isName),
  label: isName,
  date: isISODate,
  players: (value) => Array.isArray(value) && value.length > 0 && value.every(isName),
  /** A count and its share of a total, e.g. oppmøte "5 (100 %)". */
  countShare: (value) => isObject(value) && isCount(value.count) && isFormattedNumber(value.share, 'percent'),
  form: (value) => isOutcomes(value, 0),
  season: isSeason,
};

/** Number cells may be null ("no value in this period", shown as –). */
const isCell = (value, format) => (Object.hasOwn(CELL_CHECKS, format)
  ? CELL_CHECKS[format](value)
  : value === null || isFormattedNumber(value, format));

const isColumns = (columns) => Array.isArray(columns) && columns.length > 0
  && columns.every((c) => isObject(c) && isName(c.key) && TABLE_FORMATS.includes(c.format))
  && new Set(columns.map((c) => c.key)).size === columns.length;

const isScore = (score) => isObject(score) && ['A', 'B', 'D'].every((key) => isCount(score[key]));

const isTeam = (team) => Array.isArray(team) && team.length > 0 && team.every(isName);

/**
 * The match a record is about. With `score` (wins A/B and draws) it is a whole match; without,
 * it is a single game that team A won against team B (e.g. an upset).
 */
const isRecordMatch = (match) => isObject(match) && isTeam(match.A) && isTeam(match.B)
  && isOptional(match.score, isScore);

/** One set of a night: its number, both teams, the score, the winner (null while unfinished). */
const isSet = (set) => isObject(set) && isValidMatchId(set.matchId) && Number.isInteger(set.number) && set.number > 0
  && isTeam(set.A) && isTeam(set.B) && isScore(set.score)
  && [null, 'A', 'B'].includes(set.winner) && set.complete === (set.winner !== null);

const isWdl = (value) => isObject(value) && WDL_KEYS.every((key) => isCount(value[key]));

/** A matrix cell: null, or a W/D/L with at least one game. */
const isMatrixCell = (cell) => cell === null || (isWdl(cell) && cell.W + cell.D + cell.L > 0);

/** cells[j][i] is cells[i][j] seen from the other side: W and L swapped (both null if they never met). */
const isMirrored = (cell, other) => (cell === null
  ? other === null
  : other !== null && cell.W === other.L && cell.D === other.D && cell.L === other.W);

/** A square grid matching `players`: valid cells, null on the diagonal, mirrored across it. */
function isMatrixGrid(players, cells) {
  const n = players.length;
  if (!Array.isArray(cells) || cells.length !== n) return false;
  if (!cells.every((row) => Array.isArray(row) && row.length === n && row.every(isMatrixCell))) return false;
  return cells.every((row, i) => row.every((cell, j) => (i === j ? cell === null : isMirrored(cell, cells[j][i]))));
}

const VALUE_CHECKS = {
  number: ({ value, format, marker }) => isFormattedNumber(value, format) && isOptional(marker, (m) => MARKERS.includes(m)),

  wdl: isWdl,

  /** Head-to-head between two named sides: each side's wins plus the draws. */
  duel: ({ left, right, draws }) => [left, right].every((side) => isObject(side) && isName(side.name) && isCount(side.wins))
    && isCount(draws),

  table: ({ columns, rows }) => isColumns(columns) && Array.isArray(rows) && rows.every((row) => isObject(row)
    && columns.every(({ key, format }) => isCell(row[key], format))
    && isOptional(row.subject, isValidSubject)
    && isOptional(row.provisional, (p) => typeof p === 'boolean')),

  /** Optional `seasons`: the seasons a count is about (e.g. seasons won), shown by name. */
  record: ({ value, format, holders, date, matchId, match, ranking, seasons }) => isFormattedNumber(value, format)
    && Array.isArray(holders) && holders.every(isName)
    && isOptional(date, isISODate) && isOptional(matchId, isValidMatchId) && isOptional(match, isRecordMatch)
    && isOptional(ranking, (list) => Array.isArray(list) && list.length > 0
      && list.every((entry) => isObject(entry) && isName(entry.name) && isCount(entry.count) && entry.count > 0))
    && isOptional(seasons, (list) => Array.isArray(list) && list.length > 0 && list.every(isSeason)),

  chart: ({ series }) => Array.isArray(series) && series.length > 0 && series.every((s) => isObject(s)
    && isName(s.name) && Array.isArray(s.points)
    && s.points.every((p) => isObject(p) && isISODate(p.x) && Number.isFinite(p.y))),

  /** A player's most recent games, oldest first (1–FORM_GAMES). */
  form: ({ outcomes }) => isOutcomes(outcomes, 1),

  /** Sets in play order (e.g. one night's), each a small scoreboard. */
  sets: ({ sets }) => Array.isArray(sets) && sets.length > 0 && sets.every(isSet),

  /**
   * Player vs player: distinct names (at least two) and cells[i][j] = row i's results against
   * column j (null on the diagonal and where they never met).
   */
  matrix: ({ players, cells }) => Array.isArray(players) && players.length >= 2 && players.every(isName)
    && new Set(players).size === players.length && isMatrixGrid(players, cells),
};

/**
 * Whether `value` has the shape of `kind` (the stats contract). null is never valid here;
 * "not enough data" is checked separately.
 * @param {Kind} kind
 * @param {unknown} value
 */
export const isValidValue = (kind, value) =>
  Object.hasOwn(VALUE_CHECKS, kind) && isObject(value) && VALUE_CHECKS[kind](value);
