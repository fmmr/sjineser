/**
 * Sjineser backend: a thin, locked read/write layer over the sheet.
 * Script Properties: SHEET_ID (target spreadsheet), PIN (shared write PIN).
 * Every response is a JSON envelope: { ok: true, result, data } | { ok: false, error, message }.
 *
 * Matches layout (teams of 2 or 3): matchId, date, A1, A2, A3, B1, B2, B3, status (formula in I1).
 * A3 / B3 are blank for a 2-player team. This replaced the old layout (A1, A2, B1, B2, status in
 * G1); a sheet with the old layout is migrated by wiping its data tabs and running setup() again
 * (only development data existed then).
 */

const TABS = {
  Players: ['name', 'active'],
  Nights: ['date', 'players'],
  Matches: ['matchId', 'date', 'A1', 'A2', 'A3', 'B1', 'B2', 'B3'],
  Games: ['matchId', 'gameNo', 'result', 'timestamp'],
};
const TEXT_COLUMNS = { Nights: ['A'], Matches: ['A', 'B'], Games: ['A', 'D'] };
const SEATS = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3'];
/** Seat columns of Matches: C (3) to H (8). The status formula sits right after them, in I. */
const FIRST_SEAT_COLUMN = 3;
const STATUS_CELL = 'I1';
const SEAT_RANGE = 'C2:H';
const RESULTS = ['A', 'B', 'D'];
const MATCH_ID = /^\d{4}-\d{2}-\d{2}#\d+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOCK_TIMEOUT_MS = 10000;
const STATUS_FORMULA =
  '=ARRAYFORMULA(IF(ROW(A:A)=1,"status",IF(A:A="",,' +
  'LET(a,COUNTIFS(Games!A:A,A:A,Games!C:C,"A"),b,COUNTIFS(Games!A:A,A:A,Games!C:C,"B"),' +
  'IF(a>=3,"A vant ",IF(b>=3,"B vant ","ikke ferdig "))&a&"–"&b))))';

// ---------- HTTP entry points ----------

function doGet() {
  return respond(() => done('noop', readAll()));
}

function doPost(e) {
  return respond(() => handlePost(e));
}

/**
 * Runs a request and always answers with a JSON envelope. An uncaught exception would make
 * Google return an HTML error page without CORS headers, which the browser reports as a
 * CORS failure; this turns it into a retryable 'server' error and logs it to Executions.
 */
function respond(run) {
  try {
    return json(run());
  } catch (err) {
    console.error(err);
    return json(fail('server', String(err && err.message ? err.message : err)));
  }
}

function handlePost(e) {
  let request;
  try {
    request = JSON.parse(e.postData.contents);
  } catch (err) {
    return fail('invalid', 'Malformed JSON');
  }
  const pin = PropertiesService.getScriptProperties().getProperty('PIN');
  if (!pin || request.pin !== pin) return fail('pin', 'Wrong PIN');
  const handler = HANDLERS[request.action];
  if (!handler) return fail('invalid', 'Unknown action');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_TIMEOUT_MS)) return fail('busy', 'Busy, try again');
  try {
    return handler(request.payload || {});
  } finally {
    lock.releaseLock();
  }
}

// ---------- Write handlers (mirror docs/js/domain/dataset.js) ----------

const HANDLERS = {
  addPlayer({ name }) {
    const clean = cleanName(name);
    if (!clean) return fail('invalid', 'Invalid name');
    const existing = findPlayerRow(readTab('Players'), clean);
    if (existing) return done('noop', { name: existing.value.name });
    append('Players', [clean, true]);
    return done('applied', { name: clean });
  },

  /**
   * Renames a player in Players, every Nights roster and every Matches seat, in that order:
   * the Matches seat validation requires the new name to exist in Players first.
   */
  renamePlayer({ from, to }) {
    const name = cleanName(to);
    if (typeof from !== 'string' || !name) return fail('invalid', 'Invalid name');
    const players = readTab('Players');
    const player = findPlayerRow(players, from);
    if (!player) return findPlayerRow(players, name) ? done('noop') : fail('invalid', 'Unknown player');
    const old = player.value.name;
    if (old === name) return done('noop');
    const other = findPlayerRow(players, name);
    if (other && other.row !== player.row) return fail('conflict', 'Another player has that name');

    tab('Players').getRange(player.row, 1).setValue(name);
    rewriteColumns('Nights', 2, 1, (cells) => {
      const names = String(cells[0]).split(',').map((p) => p.trim()).filter(Boolean);
      return names.includes(old) ? [names.map((n) => (n === old ? name : n)).join(', ')] : null;
    });
    rewriteColumns('Matches', FIRST_SEAT_COLUMN, SEATS.length, (cells) => {
      const seats = cells.map((c) => String(c).trim());
      return seats.includes(old) ? seats.map((n) => (n === old ? name : n)) : null;
    });
    return done('applied');
  },

  setPlayerActive({ name, active }) {
    if (typeof name !== 'string' || typeof active !== 'boolean') return fail('invalid', 'Invalid player');
    const player = findPlayerRow(readTab('Players'), name);
    if (!player) return fail('invalid', 'Unknown player');
    if (player.value.active === active) return done('noop');
    tab('Players').getRange(player.row, 2).setValue(active);
    return done('applied');
  },

  /** Only players without history: never on a Nights roster, never in a Matches seat. */
  deletePlayer({ name }) {
    if (typeof name !== 'string') return fail('invalid', 'Invalid player');
    const player = findPlayerRow(readTab('Players'), name);
    if (!player) return done('noop');
    const stored = player.value.name;
    const inNights = readTab('Nights').some((r) => r.value.players.includes(stored));
    const inMatches = readTab('Matches').some((r) => SEATS.some((seat) => r.value[seat] !== '' && r.value[seat] === stored));
    if (inNights || inMatches) return fail('invalid', 'Player has history');
    tab('Players').deleteRow(player.row);
    return done('applied');
  },

  startNight({ date, players }) {
    if (!Array.isArray(players)) return fail('invalid', 'Invalid night');
    const list = players.map((p) => String(p).trim());
    const existing = readTab('Nights').find((r) => r.value.date === date);
    if (existing) {
      return sameMembers(existing.value.players, list) ? done('noop') : fail('conflict', 'Night exists with another roster');
    }
    if (!ISO_DATE.test(date) || list.length < 4 || new Set(list).size !== list.length) {
      return fail('invalid', 'Invalid night');
    }
    append('Nights', [date, list.join(', ')]);
    return done('applied');
  },

  startMatch(payload) {
    const seats = SEATS.map((seat) => String(payload[seat] || '').trim());
    const existing = readTab('Matches').find((r) => r.value.matchId === payload.matchId);
    if (existing) {
      const same = SEATS.every((seat, i) => existing.value[seat] === seats[i]);
      return same ? done('noop') : fail('conflict', 'Match exists with other players');
    }
    const validId = MATCH_ID.test(payload.matchId) && payload.matchId.split('#')[0] === payload.date;
    if (!validId || !validSeats(payload)) return fail('invalid', 'Invalid match');
    append('Matches', [payload.matchId, payload.date].concat(seats));
    return done('applied');
  },

  addGame({ matchId, gameNo, result, timestamp }) {
    if (!RESULTS.includes(result) || !Number.isInteger(gameNo) || gameNo < 1) return fail('invalid', 'Invalid game');
    if (!readTab('Matches').some((r) => r.value.matchId === matchId)) return fail('invalid', 'Unknown match');
    const existing = readTab('Games').find((r) => r.value.matchId === matchId && r.value.gameNo === gameNo);
    if (existing) {
      return existing.value.result === result ? done('noop') : fail('conflict', 'Game exists with another result');
    }
    append('Games', [matchId, gameNo, result, String(timestamp || new Date().toISOString())]);
    return done('applied');
  },

  deleteGame({ matchId, gameNo }) {
    if (!Number.isInteger(gameNo)) return fail('invalid', 'Invalid game');
    const existing = readTab('Games').find((r) => r.value.matchId === matchId && r.value.gameNo === gameNo);
    if (!existing) return done('noop');
    tab('Games').deleteRow(existing.row);
    return done('applied');
  },

  deleteMatch({ matchId }) {
    const existing = readTab('Matches').find((r) => r.value.matchId === matchId);
    if (!existing) return done('noop');
    if (readTab('Games').some((r) => r.value.matchId === matchId)) return fail('invalid', 'Match has games');
    tab('Matches').deleteRow(existing.row);
    return done('applied');
  },
};

// ---------- Sheet access ----------

const PARSERS = {
  Players: ([name, active]) => ({ name: String(name).trim(), active: active === true || String(active).toUpperCase() === 'TRUE' }),
  Nights: ([date, players]) => ({ date: isoDate(date), players: String(players).split(',').map((p) => p.trim()).filter(Boolean) }),
  Matches: ([matchId, date, ...seats]) => {
    const match = { matchId: String(matchId).trim(), date: isoDate(date) };
    SEATS.forEach((seat, i) => { match[seat] = String(seats[i] == null ? '' : seats[i]).trim(); });
    return match;
  },
  Games: ([matchId, gameNo, result, timestamp]) => ({
    matchId: String(matchId).trim(), gameNo: Number(gameNo),
    result: String(result).trim().toUpperCase(), timestamp: String(timestamp),
  }),
};

let spreadsheetCache = null;
function spreadsheet() {
  spreadsheetCache = spreadsheetCache ||
    SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
  return spreadsheetCache;
}

function tab(name) {
  return spreadsheet().getSheetByName(name);
}

/** Number of data rows, based on the last non-empty cell in column A (ignores formula columns). */
function dataRowCount(sheet) {
  const rows = sheet.getMaxRows() - 1;
  if (rows < 1) return 0;
  const values = sheet.getRange(2, 1, rows, 1).getValues();
  let last = values.length;
  while (last > 0 && values[last - 1][0] === '') last -= 1;
  return last;
}

/** Rows of a tab as { row, value }, skipping rows with an empty first column. */
function readTab(name) {
  const sheet = tab(name);
  const count = dataRowCount(sheet);
  if (count === 0) return [];
  return sheet.getRange(2, 1, count, TABS[name].length).getValues()
    .map((cells, i) => ({ row: i + 2, cells }))
    .filter((r) => r.cells[0] !== '')
    .map((r) => ({ row: r.row, value: PARSERS[name](r.cells) }));
}

function readAll() {
  const values = (name) => readTab(name).map((r) => r.value);
  return { players: values('Players'), nights: values('Nights'), matches: values('Matches'), games: values('Games') };
}

/**
 * Batch read-modify-write of `width` columns from `column` over all data rows of a tab.
 * `change(cells)` returns the new cells of a row, or null to keep it; writes only if something changed.
 */
function rewriteColumns(name, column, width, change) {
  const sheet = tab(name);
  const count = dataRowCount(sheet);
  if (count === 0) return;
  const range = sheet.getRange(2, column, count, width);
  let changed = false;
  const values = range.getValues().map((cells) => {
    const next = change(cells);
    if (!next) return cells;
    changed = true;
    return next;
  });
  if (changed) range.setValues(values);
}

function append(name, cells) {
  const sheet = tab(name);
  const row = dataRowCount(sheet) + 2;
  if (row > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 100);
  sheet.getRange(row, 1, 1, cells.length).setValues([cells]);
}

// ---------- Setup (run once per sheet from the editor) ----------

function setup() {
  const ss = spreadsheet();
  Object.keys(TABS).forEach((name) => {
    const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    sheet.getRange(1, 1, 1, TABS[name].length).setValues([TABS[name]]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    (TEXT_COLUMNS[name] || []).forEach((col) => sheet.getRange(col + ':' + col).setNumberFormat('@'));
  });
  const players = ss.getSheetByName('Players');
  players.getRange('B2:B').insertCheckboxes();
  const matches = ss.getSheetByName('Matches');
  matches.getRange(STATUS_CELL).setFormula(STATUS_FORMULA);
  // Blank cells always pass data validation, so the optional third seats (A3, B3) may stay empty.
  matches.getRange(SEAT_RANGE).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInRange(players.getRange('A2:A'), true).setAllowInvalid(false).build(),
  );
}

// ---------- Helpers ----------

function isoDate(value) {
  return value instanceof Date
    ? Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd')
    : String(value).trim();
}

/** A valid trimmed player name, or null. ',' joins names in Nights; '+' joins a pair in stats links. */
function cleanName(name) {
  if (typeof name !== 'string') return null;
  const clean = name.trim();
  return clean && !clean.includes(',') && !clean.includes('+') ? clean : null;
}

/** The Players row whose name matches case-insensitively, or undefined. */
function findPlayerRow(rows, name) {
  const wanted = String(name).trim().toLowerCase();
  return rows.find((r) => r.value.name.toLowerCase() === wanted);
}

/**
 * Mirrors validSeats in docs/js/domain/match.js: each team has 2–3 distinct non-empty players
 * (seats 1 and 2 filled, seat 3 optional) and nobody is on both teams.
 */
function validSeats(payload) {
  const names = [];
  for (const side of ['A', 'B']) {
    const team = [1, 2, 3].map((n) => payload[side + n]);
    if (!team.every((name) => name == null || typeof name === 'string')) return false;
    const clean = team.map((name) => (name == null ? '' : name.trim()));
    if (!clean[0] || !clean[1]) return false;
    names.push(...clean.filter(Boolean));
  }
  return new Set(names).size === names.length;
}

function sameMembers(a, b) {
  return a.length === b.length && a.every((name) => b.includes(name));
}

function done(result, data) {
  return { ok: true, result, data };
}

function fail(error, message) {
  return { ok: false, error, message };
}

function json(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
