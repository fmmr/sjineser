/**
 * Pure conversion of the old "Logg" export (one row per game) into Sjineser ops (spec §18).
 * No I/O: scripts/import-history.mjs reads the files and talks to the API.
 */

import { applyOp, emptyDataset } from '../../docs/js/domain/dataset.js';
import { makeMatchId, seatsOf, winnerOf } from '../../docs/js/domain/match.js';
import { byName, nameFormatError } from '../../docs/js/domain/players.js';

export const LOGG_COLUMNS = {
  date: 'Dato',
  A: ['Lag A - Spiller 1', 'Lag A - Spiller 2', 'Lag A - Spiller 3'],
  B: ['Lag B - Spiller 1', 'Lag B - Spiller 2', 'Lag B - Spiller 3'],
  pointsA: 'Poeng Lag A',
  pointsB: 'Poeng Lag B',
};
export const PLAYERS_COLUMN = 'Navn';

/** @typedef {{ date: string, A: string[], B: string[], result: 'A' | 'B' | 'D', row?: number }} ImportGame */
/** @typedef {{ date: string, A: string[], B: string[], games: ImportGame[] }} ImportMatch */

/**
 * RFC 4180-style CSV: comma-separated, double-quoted fields may contain commas, newlines and
 * doubled quotes; LF or CRLF line ends; a leading BOM is dropped. A final newline does not
 * start another row.
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const endField = () => { row.push(field); field = ''; };
  const endRow = () => { endField(); rows.push(row); row = []; };
  for (; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === ',') endField();
    else if (c === '\r' && text[i + 1] === '\n') { endRow(); i += 1; }
    else if (c === '\n' || c === '\r') endRow();
    else field += c;
  }
  if (quoted) throw new Error('CSV: unterminated quoted field');
  if (field !== '' || row.length > 0) endRow();
  return rows;
}

const isBlankRow = (cells) => cells.every((cell) => cell.trim() === '');

/** Column index by header name; throws if missing. */
function columnIndex(header, name) {
  const index = header.findIndex((cell) => cell.trim() === name);
  if (index < 0) throw new Error(`Missing column "${name}"`);
  return index;
}

/** dd.mm.yyyy → YYYY-MM-DD if it is a real calendar date, else null. */
export function isoFromNorwegian(value) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  const valid = date.getUTCFullYear() === Number(yyyy) && date.getUTCMonth() === Number(mm) - 1 && date.getUTCDate() === Number(dd);
  return valid ? `${yyyy}-${mm}-${dd}` : null;
}

/** YYYY-MM-DD → dd.mm.yyyy */
export const norwegianDate = (iso) => iso.split('-').reverse().join('.');

/** Points as numbers: 1/0 → A, 0/1 → B, 0/0 → D; anything else null. */
function resultOf(pointsA, pointsB) {
  const a = pointsA.trim() === '' ? NaN : Number(pointsA);
  const b = pointsB.trim() === '' ? NaN : Number(pointsB);
  if (a === 1 && b === 0) return 'A';
  if (a === 0 && b === 1) return 'B';
  if (a === 0 && b === 0) return 'D';
  return null;
}

/**
 * Logg rows (header first) → games in file order. Validates every row and throws one error
 * listing all problems with their row numbers (the header is row 1). Blank rows are skipped.
 * @param {string[][]} rows
 * @returns {ImportGame[]}
 */
export function parseLogg(rows) {
  if (rows.length === 0) throw new Error('Logg: empty file');
  const [header, ...body] = rows;
  const col = {
    date: columnIndex(header, LOGG_COLUMNS.date),
    A: LOGG_COLUMNS.A.map((name) => columnIndex(header, name)),
    B: LOGG_COLUMNS.B.map((name) => columnIndex(header, name)),
    pointsA: columnIndex(header, LOGG_COLUMNS.pointsA),
    pointsB: columnIndex(header, LOGG_COLUMNS.pointsB),
  };
  const errors = [];
  const games = [];
  body.forEach((cells, i) => {
    const row = i + 2;
    if (isBlankRow(cells)) return;
    const cell = (index) => (cells[index] ?? '').trim();
    const problems = [];
    const date = isoFromNorwegian(cell(col.date));
    if (!date) problems.push(`date "${cell(col.date)}" is not dd.mm.yyyy`);
    const teams = {};
    for (const side of ['A', 'B']) {
      const team = col[side].map(cell).filter(Boolean);
      teams[side] = team;
      if (team.length < 2 || team.length > 3) problems.push(`team ${side} has ${team.length} players (needs 2–3)`);
      if (new Set(team.map((n) => n.toLocaleLowerCase('nb'))).size !== team.length) problems.push(`team ${side} repeats a player`);
      for (const name of team) if (nameFormatError(name)) problems.push(`bad name "${name}"`);
    }
    const lowerB = new Set(teams.B.map((n) => n.toLocaleLowerCase('nb')));
    const overlap = teams.A.filter((n) => lowerB.has(n.toLocaleLowerCase('nb')));
    if (overlap.length) problems.push(`on both teams: ${overlap.join(', ')}`);
    const result = resultOf(cell(col.pointsA), cell(col.pointsB));
    if (!result) problems.push(`points "${cell(col.pointsA)}/${cell(col.pointsB)}" are not 1/0, 0/1 or 0/0`);
    if (problems.length) errors.push(`row ${row}: ${problems.join('; ')}`);
    else games.push({ date, A: teams.A, B: teams.B, result, row });
  });
  if (errors.length) throw new Error(`Logg has ${errors.length} invalid row(s):\n${errors.join('\n')}`);
  return games;
}

/**
 * spillere.csv rows (header "Navn" first) → trimmed names in file order, blanks skipped.
 * @param {string[][]} rows
 * @returns {string[]}
 */
export function parsePlayers(rows) {
  if (rows.length === 0) return [];
  const index = columnIndex(rows[0], PLAYERS_COLUMN);
  return rows.slice(1).map((cells) => (cells[index] ?? '').trim()).filter(Boolean);
}

const lower = (name) => name.toLocaleLowerCase('nb');
const teamKey = (team) => team.map(lower).sort().join('\u0000');
const sameTeam = (a, b) => teamKey(a) === teamKey(b);

/**
 * Groups games into matches. Games are taken per date (stable sort, so file order within a
 * date is kept). Within one date, in order, a new match starts when the two teams
 * differ from the current match's (each team an unordered set, sides ignored) or when the
 * current match already has a team at 3 wins. A game with the sides swapped belongs to the
 * same match: it is turned to the orientation of the match's first game and its A/B result
 * is swapped. Games come out in order, each carrying the match's teams.
 * @param {ImportGame[]} games in file order
 * @returns {ImportMatch[]}
 */
export function inferMatches(games) {
  const matches = [];
  let current = null;
  for (const game of [...games].sort((a, b) => a.date.localeCompare(b.date))) {
    const same = current && current.date === game.date;
    const straight = same && sameTeam(current.A, game.A) && sameTeam(current.B, game.B);
    const swapped = same && !straight && sameTeam(current.A, game.B) && sameTeam(current.B, game.A);
    if (!(straight || swapped) || winnerOf(current.games) !== null) {
      current = { date: game.date, A: [...game.A], B: [...game.B], games: [] };
      matches.push(current);
    }
    const result = swapped && game.result !== 'D' ? (game.result === 'A' ? 'B' : 'A') : game.result;
    current.games.push({ ...game, A: current.A, B: current.B, result });
  }
  return matches;
}

/** Timestamp of the i-th game (0-based) of a night: 20:00Z plus i minutes. */
export function gameTimestamp(date, i) {
  return new Date(Date.parse(`${date}T20:00:00Z`) + i * 60000).toISOString().replace('.000Z', 'Z');
}

/**
 * Ops that recreate the history in an empty sheet: addPlayer for every listed player and every
 * other name seen in the games (names that differ only in casing take the listed spelling);
 * then per date startNight (roster = everyone who played, Norwegian order), and per match
 * startMatch (date#1, date#2, … per night) followed by its addGame ops.
 * @param {string[]} players names from spillere.csv
 * @param {ImportMatch[]} matches from inferMatches
 * @returns {import('../../docs/js/domain/dataset.js').Op[]}
 */
export function buildOps(players, matches) {
  const canonical = new Map();
  const names = [];
  const add = (name) => {
    if (!canonical.has(lower(name))) { canonical.set(lower(name), name); names.push(name); }
    return canonical.get(lower(name));
  };
  players.forEach(add);
  const teams = matches.map((m) => ({ A: m.A.map(add), B: m.B.map(add) }));

  const ops = names.map((name) => ({ action: 'addPlayer', payload: { name } }));
  const dates = [...new Set(matches.map((m) => m.date))].sort();
  for (const date of dates) {
    const nightMatches = matches.map((m, i) => ({ ...m, ...teams[i] })).filter((m) => m.date === date);
    const roster = [...new Set(nightMatches.flatMap((m) => [...m.A, ...m.B]))].sort(byName);
    ops.push({ action: 'startNight', payload: { date, players: roster } });
    let gameIndex = 0;
    nightMatches.forEach((match, i) => {
      const matchId = makeMatchId(date, i + 1);
      ops.push({ action: 'startMatch', payload: { matchId, date, ...seatsOf(match.A, match.B) } });
      match.games.forEach((game, j) => {
        ops.push({
          action: 'addGame',
          payload: { matchId, gameNo: j + 1, result: game.result, timestamp: gameTimestamp(date, gameIndex) },
        });
        gameIndex += 1;
      });
    });
  }
  return ops;
}

/**
 * Folds ops through applyOp from an empty dataset; throws on the first op whose outcome is not
 * 'applied', naming the op and the outcome.
 * @param {import('../../docs/js/domain/dataset.js').Op[]} ops
 * @returns {import('../../docs/js/domain/match.js').Dataset}
 */
export function foldOps(ops) {
  let dataset = emptyDataset();
  ops.forEach((op, i) => {
    const next = applyOp(dataset, op);
    if (next.outcome !== 'applied') {
      throw new Error(`Op ${i + 1} (${op.action}) was ${next.outcome}: ${JSON.stringify(op.payload)}`);
    }
    dataset = next.dataset;
  });
  return dataset;
}

/**
 * The whole pipeline from file contents.
 * @param {{ logg: string, spillere: string }} texts
 */
export function convert({ logg, spillere }) {
  const players = parsePlayers(parseCsv(spillere));
  const games = parseLogg(parseCsv(logg));
  const matches = inferMatches(games);
  const ops = buildOps(players, matches);
  const dataset = foldOps(ops);
  return { players, games, matches, ops, dataset };
}
