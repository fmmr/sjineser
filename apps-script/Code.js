/**
 * Sjineser backend: a thin, locked read/write layer over the sheet.
 * Script Properties: SHEET_ID (target spreadsheet), PIN (shared write PIN).
 * Every response is a JSON envelope: { ok: true, result, data } | { ok: false, error, message }.
 *
 * Matches layout (teams of 2 or 3): matchId, date, A1, A2, A3, B1, B2, B3, status (formula in I1).
 * A3 / B3 are blank for a 2-player team. This replaced the old layout (A1, A2, B1, B2, status in
 * G1); a sheet with the old layout is migrated by running resetAllData() and then setup()
 * (only development data existed then).
 *
 * Nights layout: date, players (everyone who was there, comma-joined), left (those of them who
 * have gone home, comma-joined, may be blank), summarySent (ISO timestamp of the night's real
 * summary email, blank until sent; clear it by hand to allow another send). ensureHeaders() adds
 * missing headers (e.g. `left`, `summarySent`) to an older sheet on every request; existing rows
 * keep blank cells, which read as nobody left / not sent.
 *
 * Players layout: name, active, email. `email` is PRIVATE: it is only read by sendNightSummary
 * and never leaves the script (doGet is public; PARSERS.Players returns only { name, active }).
 * setup() adds the `email` header to an older sheet; addresses are typed into the sheet by hand.
 *
 * sendNightSummary uses MailApp, which needs the "Send email as you" scope (script.send_mail):
 * the owner authorises it once by running a function from the editor after deploying. Mail goes
 * against the account's daily recipient quota (MailApp.getRemainingDailyQuota()). Anti-spam: a
 * night's summary goes out for real once (Nights.summarySent), and at most MAX_DAILY_SENDS real
 * sends a day across all nights (Script Property SUMMARY_SENDS = 'YYYY-MM-DD:n').
 */

const TABS = {
  Players: ['name', 'active', 'email'],
  Nights: ['date', 'players', 'left', 'summarySent'],
  Matches: ['matchId', 'date', 'A1', 'A2', 'A3', 'B1', 'B2', 'B3'],
  Games: ['matchId', 'gameNo', 'result', 'timestamp'],
};
const TEXT_COLUMNS = { Nights: ['A', 'D'], Matches: ['A', 'B'], Games: ['A', 'D'] };
const SEATS = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3'];
/** Seat columns of Matches: C (3) to H (8). The status formula sits right after them, in I. */
const FIRST_SEAT_COLUMN = 3;
const STATUS_CELL = 'I1';
const SEAT_RANGE = 'C2:H';
const RESULTS = ['A', 'B', 'D'];
const MATCH_ID = /^\d{4}-\d{2}-\d{2}#\d+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOCK_TIMEOUT_MS = 10000;
/** Caps for the night summary email (the client builds the text and HTML; this only bounds them). */
const MAX_SUBJECT = 200;
const MAX_TEXT = 20000;
const MAX_HTML = 100000;
const TEST_SUBJECT_PREFIX = '[TEST] ';
/** Nights column of summarySent (D). */
const SUMMARY_SENT_COLUMN = 4;
/** Real summary sends allowed per day (script time zone), all nights together; counted in SUMMARY_SENDS. */
const MAX_DAILY_SENDS = 3;
const SENDS_PROPERTY = 'SUMMARY_SENDS';
/** A plain address check: something@domain.tld, no spaces or list separators. */
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const STATUS_FORMULA =
  '=ARRAYFORMULA(IF(ROW(A:A)=1,"status",IF(A:A="",,' +
  'LET(a,COUNTIFS(Games!A:A,A:A,Games!C:C,"A"),b,COUNTIFS(Games!A:A,A:A,Games!C:C,"B"),' +
  'IF(a>=3,"A vant ",IF(b>=3,"B vant ","ikke ferdig "))&a&"–"&b))))';

// ---------- HTTP entry points ----------

function doGet() {
  return respond(() => {
    ensureHeaders();
    return done('noop', readAll());
  });
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
    ensureHeaders();
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
   * Renames a player in Players, every Nights roster (and left list) and every Matches seat, in that order:
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
    rewriteColumns('Nights', 2, 2, (cells) => {
      const lists = cells.map(splitNames);
      if (!lists.some((names) => names.includes(old))) return null;
      return lists.map((names) => names.map((n) => (n === old ? name : n)).join(', '));
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
    append('Nights', [date, list.join(', '), '']);
    return done('applied');
  },

  /** Puts an existing player on a night's roster, or brings back one who had gone home. */
  joinNight({ date, name }) {
    const night = readTab('Nights').find((r) => r.value.date === date);
    const player = typeof name === 'string' ? findPlayerRow(readTab('Players'), name) : null;
    if (!night || !player) return fail('invalid', 'Unknown night or player');
    const stored = player.value.name;
    const { players, left } = night.value;
    if (left.includes(stored)) {
      writeRoster(night.row, players, left.filter((n) => n !== stored));
      return done('applied');
    }
    if (players.includes(stored)) return done('noop');
    writeRoster(night.row, players.concat([stored]), left);
    return done('applied');
  },

  /** Marks a player on the roster as gone home; they stay on the roster (attendance). */
  leaveNight({ date, name }) {
    const night = readTab('Nights').find((r) => r.value.date === date);
    const player = typeof name === 'string' ? findPlayerRow(readTab('Players'), name) : null;
    if (!night || !player || !night.value.players.includes(player.value.name)) {
      return fail('invalid', 'Player is not on the night roster');
    }
    const stored = player.value.name;
    const { players, left } = night.value;
    if (left.includes(stored)) return done('noop');
    writeRoster(night.row, players, left.concat([stored]));
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

  /**
   * Emails a night summary (subject, HTML body and plain-text fallback, all built by the app) in
   * ONE message: to the script owner, every active player with an address in CC (the players see
   * who got it). With `testPlayer` (a name) only that player gets it, as `to`, with "[TEST] "
   * before the subject. A real send happens once per night (refused as `conflict` once
   * summarySent is set; stamps it after sending) and at most MAX_DAILY_SENDS times a day
   * (`quota`); test sends skip both and stamp nothing. Not idempotent otherwise; the reply holds
   * the count only, never addresses.
   */
  sendNightSummary({ date, subject, text, html, testPlayer }) {
    const night = readTab('Nights').find((r) => r.value.date === date);
    if (!night) return fail('invalid', 'Unknown night');
    if (typeof subject !== 'string' || !subject.trim() || typeof text !== 'string' || !text.trim()
      || typeof html !== 'string' || !html.trim()) {
      return fail('invalid', 'Empty email');
    }
    const test = typeof testPlayer === 'string' && testPlayer.trim() !== '';
    if (!test && night.value.summarySent) return fail('conflict', 'Summary already sent');
    const sends = test ? null : sendsToday();
    if (sends && sends.count >= MAX_DAILY_SENDS) return fail('quota', 'Daily send limit reached');
    const recipients = summaryRecipients(readPlayersWithEmail(), test ? testPlayer : undefined);
    if (recipients.length === 0) return fail('invalid', test ? 'Test player has no email' : 'No recipients');
    const message = test
      ? { to: recipients[0], subject: TEST_SUBJECT_PREFIX + subject }
      : { to: Session.getEffectiveUser().getEmail(), cc: recipients.join(','), subject };
    // The owner (`to`) counts against the quota as well.
    if (MailApp.getRemainingDailyQuota() < (test ? 1 : recipients.length + 1)) return fail('quota', 'Daily email quota used up');
    message.subject = message.subject.slice(0, MAX_SUBJECT);
    message.body = text.slice(0, MAX_TEXT);
    message.htmlBody = html.slice(0, MAX_HTML);
    MailApp.sendEmail(message);
    if (!test) {
      PropertiesService.getScriptProperties().setProperty(SENDS_PROPERTY, `${sends.day}:${sends.count + 1}`);
      tab('Nights').getRange(night.row, SUMMARY_SENT_COLUMN).setNumberFormat('@').setValue(new Date().toISOString());
    }
    return done('applied', { recipients: recipients.length });
  },
};

/** Real summary sends so far today (script time zone), from SUMMARY_SENDS; another day counts from 0. */
function sendsToday() {
  const day = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const found = /^(\d{4}-\d{2}-\d{2}):(\d+)$/.exec(PropertiesService.getScriptProperties().getProperty(SENDS_PROPERTY) || '');
  return { day, count: found && found[1] === day ? Number(found[2]) : 0 };
}

/**
 * Who gets the night summary: the valid addresses (trimmed, no duplicates in any casing) of the
 * ACTIVE players — an inactive player never does, address or not. With `testPlayer`, only that
 * player's address (name matched case-insensitively, active or not). Pure, so it can be tested.
 * @param {{ name: string, active: boolean, email: string }[]} players
 * @param {string} [testPlayer]
 * @returns {string[]} empty when nobody qualifies
 */
function summaryRecipients(players, testPlayer) {
  const chosen = testPlayer === undefined
    ? players.filter((p) => p.active === true)
    : players.filter((p) => p.name.toLowerCase() === String(testPlayer).trim().toLowerCase());
  const seen = new Set();
  return chosen.map((p) => String(p.email == null ? '' : p.email).trim()).filter((email) => {
    const key = email.toLowerCase();
    if (!EMAIL.test(email) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------- Sheet access ----------

const PARSERS = {
  // PRIVACY: never add `email` (column C) here. doGet returns these objects to anyone; addresses
  // are read only by readPlayersWithEmail() for sendNightSummary (tests/apps-script/code.test.js checks doGet).
  Players: ([name, active]) => ({ name: String(name).trim(), active: active === true || String(active).toUpperCase() === 'TRUE' }),
  Nights: ([date, players, left, summarySent]) => ({
    date: isoDate(date), players: splitNames(players), left: splitNames(left), summarySent: timestamp(summarySent),
  }),
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

/** Rows of a tab as { row, value }, skipping rows with an empty first column. `parse` defaults to the tab's parser. */
function readTab(name, parse = PARSERS[name]) {
  const sheet = tab(name);
  const count = dataRowCount(sheet);
  if (count === 0) return [];
  return sheet.getRange(2, 1, count, TABS[name].length).getValues()
    .map((cells, i) => ({ row: i + 2, cells }))
    .filter((r) => r.cells[0] !== '')
    .map((r) => ({ row: r.row, value: parse(r.cells) }));
}

/** Players with their (private) email column, for sendNightSummary only. Never return these to a client. */
function readPlayersWithEmail() {
  return readTab('Players', (cells) => ({ ...PARSERS.Players(cells), email: String(cells[2] == null ? '' : cells[2]).trim() }))
    .map((r) => r.value);
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

/** Writes a Nights row's players and left cells (columns B–C). */
function writeRoster(row, players, left) {
  tab('Nights').getRange(row, 2, 1, 2).setValues([[players.join(', '), left.join(', ')]]);
}

function append(name, cells) {
  const sheet = tab(name);
  const row = dataRowCount(sheet) + 2;
  if (row > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 100);
  sheet.getRange(row, 1, 1, cells.length).setValues([cells]);
}

let headersChecked = false;

/**
 * Writes any missing header cell of row 1 of every tab (e.g. `summarySent` on an older Nights
 * tab), so a new column needs no setup() run. Cheap and idempotent: one read per tab, writes
 * only blanks; once per execution. Tabs that do not exist yet are left to setup().
 */
function ensureHeaders() {
  if (headersChecked) return;
  headersChecked = true;
  Object.keys(TABS).forEach((name) => {
    const sheet = tab(name);
    if (!sheet) return;
    const cells = sheet.getRange(1, 1, 1, TABS[name].length).getValues()[0];
    TABS[name].forEach((title, i) => {
      if (String(cells[i] == null ? '' : cells[i]).trim() === '') sheet.getRange(1, i + 1).setValue(title);
    });
  });
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

/**
 * DANGER: DELETES ALL DATA. Clears every data row (row 2 and down) of Players, Nights, Matches
 * and Games, every player, night, match and game, and keeps only the header rows. There is no undo
 * apart from the spreadsheet's version history.
 *
 * Only for the one-off history import (spec §18): the owner runs it by hand from the Apps Script
 * editor, then runs setup(), then `npm run import:history -- --apply`. It is deliberately not in
 * HANDLERS, so neither doGet nor doPost can reach it. Clears values only (formats, checkboxes,
 * data validation and the status formula in I1 stay).
 */
function resetAllData() {
  Object.keys(TABS).forEach((name) => {
    const sheet = tab(name);
    if (!sheet) return;
    const rows = sheet.getMaxRows() - 1;
    if (rows > 0) sheet.getRange(2, 1, rows, TABS[name].length).clearContent();
  });
}

// ---------- Helpers ----------

function isoDate(value) {
  return value instanceof Date
    ? Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd')
    : String(value).trim();
}

/** A timestamp cell as an ISO string ('' when blank); a cell Sheets turned into a date is converted back. */
function timestamp(cell) {
  if (cell instanceof Date) return cell.toISOString();
  return String(cell == null ? '' : cell).trim();
}

/** A comma-joined cell as trimmed names; blank (or missing) is an empty list. */
function splitNames(cell) {
  return String(cell == null ? '' : cell).split(',').map((p) => p.trim()).filter(Boolean);
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
