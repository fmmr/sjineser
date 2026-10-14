/**
 * Sjineser backend: a thin, locked read/write layer over the sheet.
 * Script Properties: SHEET_ID (target spreadsheet), PIN (shared write PIN).
 * Every response is a JSON envelope: { ok: true, result, data } | { ok: false, error, message }.
 */

const TABS = {
  Players: ['name', 'active'],
  Nights: ['date', 'players'],
  Matches: ['matchId', 'date', 'A1', 'A2', 'B1', 'B2'],
  Games: ['matchId', 'gameNo', 'result', 'timestamp'],
};
const TEXT_COLUMNS = { Nights: ['A'], Matches: ['A', 'B'], Games: ['A', 'D'] };
const SEATS = ['A1', 'A2', 'B1', 'B2'];
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
  return json(done('noop', readAll()));
}

function doPost(e) {
  let request;
  try {
    request = JSON.parse(e.postData.contents);
  } catch (err) {
    return json(fail('invalid', 'Malformed JSON'));
  }
  const pin = PropertiesService.getScriptProperties().getProperty('PIN');
  if (!pin || request.pin !== pin) return json(fail('pin', 'Wrong PIN'));
  const handler = HANDLERS[request.action];
  if (!handler) return json(fail('invalid', 'Unknown action'));

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_TIMEOUT_MS)) return json(fail('busy', 'Busy, try again'));
  try {
    return json(handler(request.payload || {}));
  } finally {
    lock.releaseLock();
  }
}

// ---------- Write handlers (mirror docs/js/domain/dataset.js) ----------

const HANDLERS = {
  addPlayer({ name }) {
    const clean = String(name || '').trim();
    if (!clean || clean.includes(',')) return fail('invalid', 'Invalid name');
    const existing = readTab('Players').find((r) => r.value.name.toLowerCase() === clean.toLowerCase());
    if (existing) return done('noop', { name: existing.value.name });
    append('Players', [clean, true]);
    return done('applied', { name: clean });
  },

  startNight({ date, players }) {
    const list = (players || []).map((p) => String(p).trim());
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
    if (!validId || seats.some((s) => !s) || new Set(seats).size !== 4) {
      return fail('invalid', 'Invalid match');
    }
    append('Matches', [payload.matchId, payload.date].concat(seats));
    return done('applied');
  },

  addGame({ matchId, gameNo, result, timestamp }) {
    const number = Number(gameNo);
    if (!RESULTS.includes(result) || !Number.isInteger(number) || number < 1) return fail('invalid', 'Invalid game');
    if (!readTab('Matches').some((r) => r.value.matchId === matchId)) return fail('invalid', 'Unknown match');
    const existing = readTab('Games').find((r) => r.value.matchId === matchId && r.value.gameNo === number);
    if (existing) {
      return existing.value.result === result ? done('noop') : fail('conflict', 'Game exists with another result');
    }
    append('Games', [matchId, number, result, String(timestamp || new Date().toISOString())]);
    return done('applied');
  },

  deleteGame({ matchId, gameNo }) {
    const existing = readTab('Games').find((r) => r.value.matchId === matchId && r.value.gameNo === Number(gameNo));
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
  Matches: ([matchId, date, A1, A2, B1, B2]) => ({
    matchId: String(matchId).trim(), date: isoDate(date),
    A1: String(A1).trim(), A2: String(A2).trim(), B1: String(B1).trim(), B2: String(B2).trim(),
  }),
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
  matches.getRange('G1').setFormula(STATUS_FORMULA);
  matches.getRange('C2:F').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInRange(players.getRange('A2:A'), true).setAllowInvalid(false).build(),
  );
}

// ---------- Helpers ----------

function isoDate(value) {
  return value instanceof Date
    ? Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd')
    : String(value).trim();
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
