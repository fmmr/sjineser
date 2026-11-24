/**
 * Sjineser backend: a thin, locked read/write layer over the sheet(s).
 * Every response is a JSON envelope: { ok: true, result, data } | { ok: false, error, message }.
 *
 * Leagues: one deployment serves several independent leagues (groups of players), each with its
 * OWN spreadsheet and its OWN write PIN. A request names its league with `l` (GET query
 * parameter) or `league` (POST body, next to action/payload/pin). No league, an empty one or
 * 'main' is the MAIN league, so old cached clients keep working. An id is lowercase [a-z0-9-],
 * 3-40 characters, starting with a letter or digit; anything else is 'Unknown league' without
 * touching any Script Property (so 'PIN' or 'SHEET_ID' can never be read through an id).
 * A request for a league that is not registered, main included, is 'Unknown league'.
 *
 * Script Properties (Project Settings; never in the code) are for the app as a whole. Each league,
 * main included, is ONE property:
 * - LEAGUE_<id> (LEAGUE_main for main): JSON {"name":"Familie","sheetId":"<spreadsheet id>","pin":"<pin>"}.
 *   sheetId and pin must be non-empty strings. `name` is optional and only the STARTING value of
 *   the league's name (the default is the id, 'Sjineser' for main): the live name is the `name`
 *   row of the league's Settings tab. A registration that is absent or invalid makes the league
 *   unknown (main included); prepareLeagues() logs an invalid one as failed.
 * - SCHEMA_<id> (SCHEMA_main for main): the SCHEMA_VERSION the league's sheet was last prepared
 *   for. Written by the script itself.
 * - SUMMARY_SENDS (main) / SUMMARY_SENDS_<id>: real summary emails sent today, 'YYYY-MM-DD:n'.
 *
 * Schema/setup is lazy and versioned: every request reads SCHEMA_<id> (one property read); when it
 * differs from SCHEMA_VERSION the league's sheet is prepared once (missing tabs, headers, formats,
 * checkboxes, status formula, seat validation, the seeded Settings name) inside the script lock,
 * and the version is stored. A new column or tab is therefore a SCHEMA_VERSION bump, not a
 * per-request header check. setup() and prepareLeagues() run the same preparation by hand from
 * the editor.
 *
 * Settings layout: key, value (one setting per row). Only the keys in SETTING_KEYS are ever read
 * or returned (today `name`, the league's display name, 1-40 characters, changed by the
 * setLeagueName handler); the tab as a whole never leaves the script. A blank value counts as
 * absent and the first row of a key is the one that counts. The effective name is the Settings
 * name, else the registered default.
 *
 * Matches layout (teams of 2 or 3): matchId, date, A1, A2, A3, B1, B2, B3, status (formula in I1).
 * A3 / B3 are blank for a 2-player team. This replaced the old layout (A1, A2, B1, B2, status in
 * G1); a sheet with the old layout is migrated by running resetAllData() and then setup()
 * (only development data existed then).
 *
 * Nights layout: date, players (everyone who was there, comma-joined), left (those of them who
 * have gone home, comma-joined, may be blank), summarySent (ISO timestamp of the night's real
 * summary email, blank until sent; clear it by hand to allow another send). The preparation adds
 * missing headers (e.g. `left`, `summarySent`) to an older sheet; existing rows keep blank cells,
 * which read as nobody left / not sent.
 *
 * Players layout: name, active, email. `email` is PRIVATE: it is only read by sendNightSummary
 * and never leaves the script (doGet is public; PARSERS.Players returns only { name, active }).
 * Addresses are typed into the sheet by hand; players without a valid one are simply not mailed.
 *
 * sendNightSummary uses MailApp, which needs the "Send email as you" scope (script.send_mail):
 * the owner authorises it once by running authorize() from the editor after deploying. Mail
 * always comes from the owner's account (To = owner, CC = the players) and goes against the
 * account's daily recipient quota (MailApp.getRemainingDailyQuota()). Anti-spam: a night's
 * summary goes out for real once (Nights.summarySent), and at most MAX_DAILY_SENDS real sends a
 * day PER LEAGUE. Test sends (testPlayer) exist in the main league only.
 *
 * Backup and restore: the exportData handler returns a league's whole data as ONE JSON document
 * (buildBackup; the players' email included, which is why it needs the league's PIN, unlike GET).
 * restoreData loads such a document into an EMPTY league (validateBackup first, then one bulk write
 * per tab). sendBackups() (a weekly time trigger, installBackupTrigger()) mails every league's
 * backup to the script owner only. The trigger functions are not in HANDLERS: the web cannot call them.
 */

const TABS = {
  Players: ['name', 'active', 'email'],
  Nights: ['date', 'players', 'left', 'summarySent'],
  Matches: ['matchId', 'date', 'A1', 'A2', 'A3', 'B1', 'B2', 'B3'],
  Games: ['matchId', 'gameNo', 'result', 'timestamp'],
  Settings: ['key', 'value'],
};
/** Text format keeps a name like "2026" or "=x" a plain string in Settings. */
const TEXT_COLUMNS = { Nights: ['A', 'D'], Matches: ['A', 'B'], Games: ['A', 'D'], Settings: ['A', 'B'] };
/** The tabs that hold data (everything but the Settings configuration). */
const DATA_TABS = ['Players', 'Nights', 'Matches', 'Games'];
/** The settings that exist; nothing else in the Settings tab is ever read or returned. */
const SETTING_KEYS = ['name'];
/** Settings is tiny (one row per key): one read of this many rows is plenty and costs a single call. */
const SETTINGS_READ_ROWS = 50;
const MAX_LEAGUE_NAME = 40;
/** Control characters (incl. newlines and the Unicode line separators) never belong in a league name. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
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
/** Real summary sends allowed per day (script time zone) and league, all nights together; counted in SUMMARY_SENDS[_<id>]. */
const MAX_DAILY_SENDS = 3;
const SENDS_PROPERTY = 'SUMMARY_SENDS';
/** Backup document: its `format`, the only `version` restore accepts, and the size caps that bound a restore. */
const BACKUP_FORMAT = 'sjineser-backup';
const BACKUP_VERSION = 1;
const MAX_BACKUP_ROWS = { players: 500, nights: 2000, matches: 10000, games: 60000 };
/** A timestamp cell is an ISO string (24 characters); anything much longer is not one. */
const MAX_TIMESTAMP = 100;
/** The function the weekly time trigger runs (see installBackupTrigger). */
const BACKUP_FUNCTION = 'sendBackups';
const MAIN_LEAGUE = 'main';
const DEFAULT_LEAGUE_NAME = 'Sjineser';
/** League ids: lowercase letters, digits and '-', 3-40 characters, not starting with '-'. */
const LEAGUE_ID = /^[a-z0-9][a-z0-9-]{2,39}$/;
const LEAGUE_PREFIX = 'LEAGUE_';
/** Bump when the sheet layout changes (new tab, column, format): every league is then prepared again, once. */
const SCHEMA_VERSION = 2;
const SCHEMA_PREFIX = 'SCHEMA_';
/** A plain address check: something@domain.tld, no spaces or list separators. */
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const STATUS_FORMULA =
  '=ARRAYFORMULA(IF(ROW(A:A)=1,"status",IF(A:A="",,' +
  'LET(a,COUNTIFS(Games!A:A,A:A,Games!C:C,"A"),b,COUNTIFS(Games!A:A,A:A,Games!C:C,"B"),' +
  'IF(a>=3,"A vant ",IF(b>=3,"B vant ","ikke ferdig "))&a&"–"&b))))';

// ---------- HTTP entry points ----------

/** Reads one league's data (`?l=<id>`; none means main). Takes the lock only while its sheet is being prepared. */
function doGet(e) {
  return respond(() => {
    const league = enterLeague(e && e.parameter ? e.parameter.l : undefined);
    if (!league) return fail('invalid', 'Unknown league');
    if (!schemaCurrent()) {
      const lock = LockService.getScriptLock();
      if (!lock.tryLock(LOCK_TIMEOUT_MS)) return fail('busy', 'Busy, try again');
      try {
        // Another request may have prepared the sheet while this one waited for the lock.
        prepareLeague(false);
      } finally {
        lock.releaseLock();
      }
    }
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
  if (request === null || typeof request !== 'object') return fail('invalid', 'Malformed JSON');
  // The league first, so a wrong league is not mistaken for a wrong PIN; the PIN is that league's only.
  const league = enterLeague(request.league);
  if (!league) return fail('invalid', 'Unknown league');
  if (!league.pin || request.pin !== league.pin) return fail('pin', 'Wrong PIN');
  const handler = HANDLERS[request.action];
  if (!handler) return fail('invalid', 'Unknown action');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_TIMEOUT_MS)) return fail('busy', 'Busy, try again');
  try {
    prepareLeague(false);
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
   * Sets the league's display name (the `name` row of Settings). Not a client-op the app mirrors:
   * the app calls it directly and re-reads. 1-40 characters after trimming, no control characters.
   */
  setLeagueName({ name }) {
    const clean = typeof name === 'string' ? name.trim() : '';
    if (!clean || Array.from(clean).length > MAX_LEAGUE_NAME || CONTROL_CHARS.test(clean)) return fail('invalid', 'Invalid name');
    if (clean === leagueName()) return done('noop', { name: clean });
    writeSetting(tab('Settings'), 'name', clean);
    return done('applied', { name: clean });
  },

  /**
   * The whole league as ONE backup document (see buildBackup), including the players' email, so it
   * needs the league's PIN like every handler. Read-only; the payload is ignored. The reply is
   * `noop`: nothing was changed.
   */
  exportData() {
    return done('noop', readBackup());
  },

  /**
   * Loads a backup into an EMPTY league: refused as `conflict` when any data row exists (checked
   * first, inside the lock the POST holds, so a second call is refused too), and as `invalid`
   * (with the reason from validateBackup) before anything is written when the document is not
   * acceptable under the normal write rules. The name in Settings is never touched. If the write
   * itself fails half way, the rows already written are cleared again so the league stays empty
   * and the restore can be retried.
   */
  restoreData({ backup } = {}) {
    if (!leagueIsEmpty()) return fail('conflict', 'League is not empty');
    const parsed = parseBackup(backup);
    if (parsed.error) return fail('invalid', parsed.error);
    const { players, nights, matches, games } = parsed.data;
    try {
      // Players first: the Matches seat validation requires the names to exist.
      writeRows('Players', players.map((p) => [p.name, p.active, p.email]));
      writeRows('Nights', nights.map((n) => [n.date, n.players.join(', '), n.left.join(', '), n.summarySent]));
      writeRows('Matches', matches.map((m) => [m.matchId, m.date].concat(SEATS.map((seat) => m[seat]))));
      writeRows('Games', games.map((g) => [g.matchId, g.gameNo, g.result, g.timestamp]));
    } catch (err) {
      DATA_TABS.forEach((name) => clearDataRows(tab(name), name));
      throw err;
    }
    return done('applied', { players: players.length, nights: nights.length, matches: matches.length, games: games.length });
  },

  /**
   * Emails a night summary (subject, HTML body and plain-text fallback, all built by the app) in
   * ONE message: to the script owner, every active player with an address in CC (the players see
   * who got it). With `testPlayer` (a name) only that player gets it, as `to`, with "[TEST] "
   * before the subject. A real send happens once per night (refused as `conflict` once
   * summarySent is set; stamps it after sending) and at most MAX_DAILY_SENDS times a day per
   * league (`quota`); test sends skip both and stamp nothing, and exist in the main league only.
   * Players without a valid address are skipped, never an error. Not idempotent otherwise; the
   * reply holds counts only, never addresses: `recipients` mailed, `missing` active players
   * without a usable address. A league other than main sends under its own name.
   */
  sendNightSummary({ date, subject, text, html, testPlayer }) {
    const test = typeof testPlayer === 'string' && testPlayer.trim() !== '';
    if (test && !currentLeague.main) return fail('invalid', 'Test send is only for the main league');
    const night = readTab('Nights').find((r) => r.value.date === date);
    if (!night) return fail('invalid', 'Unknown night');
    if (typeof subject !== 'string' || !subject.trim() || typeof text !== 'string' || !text.trim()
      || typeof html !== 'string' || !html.trim()) {
      return fail('invalid', 'Empty email');
    }
    if (!test && night.value.summarySent) return fail('conflict', 'Summary already sent');
    const sends = test ? null : sendsToday();
    if (sends && sends.count >= MAX_DAILY_SENDS) return fail('quota', 'Daily send limit reached');
    const players = readPlayersWithEmail();
    const recipients = summaryRecipients(players, test ? testPlayer : undefined);
    if (recipients.length === 0) return fail('invalid', test ? 'Test player has no email' : 'No recipients');
    const message = test
      ? { to: recipients[0], subject: TEST_SUBJECT_PREFIX + subject }
      : { to: Session.getEffectiveUser().getEmail(), cc: recipients.join(','), subject };
    // The owner (`to`) counts against the quota as well.
    if (MailApp.getRemainingDailyQuota() < (test ? 1 : recipients.length + 1)) return fail('quota', 'Daily email quota used up');
    message.subject = message.subject.slice(0, MAX_SUBJECT);
    message.body = text.slice(0, MAX_TEXT);
    message.htmlBody = html.slice(0, MAX_HTML);
    if (!currentLeague.main) message.name = leagueName();
    MailApp.sendEmail(message);
    if (!test) {
      PropertiesService.getScriptProperties().setProperty(sendsProperty(), `${sends.day}:${sends.count + 1}`);
      tab('Nights').getRange(night.row, SUMMARY_SENT_COLUMN).setNumberFormat('@').setValue(new Date().toISOString());
    }
    return done('applied', { recipients: recipients.length, missing: test ? 0 : countMissingEmails(players) });
  },
};

/** Script Property that counts the current league's real sends today. */
function sendsProperty() {
  return currentLeague.main ? SENDS_PROPERTY : `${SENDS_PROPERTY}_${currentLeague.id}`;
}

/** Real summary sends so far today (script time zone) in the current league; another day counts from 0. */
function sendsToday() {
  const day = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const found = /^(\d{4}-\d{2}-\d{2}):(\d+)$/.exec(PropertiesService.getScriptProperties().getProperty(sendsProperty()) || '');
  return { day, count: found && found[1] === day ? Number(found[2]) : 0 };
}

/**
 * How many ACTIVE players have no usable address (blank or invalid). A duplicate address is not
 * missing, just mailed once; inactive players are never counted. Pure, so it can be tested.
 * @param {{ active: boolean, email: string }[]} players
 */
function countMissingEmails(players) {
  return players.filter((p) => p.active === true && !EMAIL.test(String(p.email == null ? '' : p.email).trim())).length;
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
/** The current league's spreadsheet (see enterLeague), opened once per league entered. */
function spreadsheet() {
  if (!currentLeague || !currentLeague.sheetId) throw new Error('No spreadsheet configured');
  spreadsheetCache = spreadsheetCache || SpreadsheetApp.openById(currentLeague.sheetId);
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

/**
 * The Settings rows as { row, key, value } (trimmed) in ONE range read, no row count first.
 * A sheet without the tab (not prepared yet) has no settings.
 */
function settingRows(sheet = tab('Settings')) {
  const rows = sheet ? Math.min(sheet.getMaxRows() - 1, SETTINGS_READ_ROWS) : 0;
  if (rows < 1) return [];
  return sheet.getRange(2, 1, rows, 2).getValues().map((cells, i) => ({
    row: i + 2, key: String(cells[0] == null ? '' : cells[0]).trim(), value: String(cells[1] == null ? '' : cells[1]).trim(),
  }));
}

/** The known settings of the current league, '' for a missing or blank one. Unknown keys are dropped here. */
function readSettings() {
  const rows = settingRows();
  const settings = {};
  SETTING_KEYS.forEach((key) => {
    const found = rows.find((r) => r.key === key);
    settings[key] = found ? found.value : '';
  });
  return settings;
}

/** Writes a setting: updates the key's first row, or appends one when there is none. */
function writeSetting(sheet, key, value) {
  const found = settingRows(sheet).find((r) => r.key === key);
  if (found) sheet.getRange(found.row, 2).setValue(value);
  else appendTo(sheet, [key, value]);
}

/** The current league's effective name: the Settings name when not blank, else the registered default. */
function leagueName() {
  return readSettings().name || currentLeague.name;
}

function readAll() {
  const values = (name) => readTab(name).map((r) => r.value);
  return {
    league: { id: currentLeague.id, name: leagueName(), main: currentLeague.main },
    players: values('Players'), nights: values('Nights'), matches: values('Matches'), games: values('Games'),
  };
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
  appendTo(tab(name), cells);
}

function appendTo(sheet, cells) {
  const row = dataRowCount(sheet) + 2;
  if (row > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 100);
  sheet.getRange(row, 1, 1, cells.length).setValues([cells]);
}

// ---------- Backup and restore ----------

/**
 * The backup document of a league: its identity and all four data tabs. Pure, so it can be tested
 * and reused by the weekly email. Only the listed fields are copied (nothing else leaks in).
 * `data.players` carry the email column (see readPlayersWithEmail).
 * @param {{ id: string, name: string }} league
 * @param {{ players: object[], nights: object[], matches: object[], games: object[] }} data
 * @param {string} exportedAt ISO timestamp
 */
function buildBackup(league, data, exportedAt) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt,
    league: { id: league.id, name: league.name },
    players: data.players.map((p) => ({ name: p.name, active: p.active, email: p.email })),
    nights: data.nights.map((n) => ({ date: n.date, players: [...n.players], left: [...n.left], summarySent: n.summarySent })),
    matches: data.matches.map((m) => {
      const match = { matchId: m.matchId, date: m.date };
      SEATS.forEach((seat) => { match[seat] = m[seat]; });
      return match;
    }),
    games: data.games.map((g) => ({ matchId: g.matchId, gameNo: g.gameNo, result: g.result, timestamp: g.timestamp })),
  };
}

/** The current league's backup document, read with the same parsers as GET (plus the private email column). */
function readBackup() {
  const values = (name) => readTab(name).map((r) => r.value);
  const data = { players: readPlayersWithEmail(), nights: values('Nights'), matches: values('Matches'), games: values('Games') };
  return buildBackup({ id: currentLeague.id, name: leagueName() }, data, new Date().toISOString());
}

/**
 * Why a backup document cannot be restored, or null when it can. Applies the normal write rules
 * (see parseBackup) to the WHOLE document; never throws, whatever the input is.
 * @returns {string | null} a short English reason
 */
function validateBackup(backup) {
  return parseBackup(backup).error || null;
}

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** A list of trimmed, distinct, non-empty strings (a night's roster), or null when it is anything else. */
function nameList(list) {
  if (!Array.isArray(list) || !list.every((n) => typeof n === 'string')) return null;
  const names = list.map((n) => n.trim());
  return new Set(names).size === names.length && names.every(Boolean) ? names : null;
}

/**
 * Checks a backup document against the rules of the normal writes (cleanName, ISO dates, MATCH_ID
 * with its date part, validSeats, results, no duplicates, every name a known player) and returns
 * { data } with the rows exactly as they will be written (trimmed, a bad email blanked), or
 * { error }. Nothing here touches a sheet. Never throws.
 */
function parseBackup(backup) {
  if (!isRecord(backup) || backup.format !== BACKUP_FORMAT) return { error: 'Not a Sjineser backup' };
  if (backup.version !== BACKUP_VERSION) return { error: 'Unsupported backup version' };
  const label = { players: 'Invalid player', nights: 'Invalid night', matches: 'Invalid match', games: 'Invalid game' };
  for (const key of Object.keys(label)) {
    if (!Array.isArray(backup[key])) return { error: label[key] };
  }
  for (const key of Object.keys(label)) {
    if (backup[key].length > MAX_BACKUP_ROWS[key]) return { error: 'Too many rows' };
  }

  const playerNames = new Set();
  const lowerNames = new Set();
  const players = [];
  for (const p of backup.players) {
    const name = isRecord(p) ? cleanName(p.name) : null;
    const emailOk = isRecord(p) && (p.email == null || typeof p.email === 'string');
    if (!name || !emailOk || typeof p.active !== 'boolean' || lowerNames.has(name.toLowerCase())) return { error: 'Invalid player' };
    const email = String(p.email == null ? '' : p.email).trim();
    lowerNames.add(name.toLowerCase());
    playerNames.add(name);
    players.push({ name, active: p.active, email: EMAIL.test(email) ? email : '' });
  }

  const nightDates = new Set();
  const nights = [];
  for (const n of backup.nights) {
    const roster = isRecord(n) ? nameList(n.players) : null;
    const left = isRecord(n) ? nameList(n.left) : null;
    const sent = isRecord(n) && typeof n.summarySent === 'string' ? n.summarySent.trim() : null;
    const sentOk = sent === '' || (sent !== null && sent.length <= MAX_TIMESTAMP && /^\d{4}-\d{2}-\d{2}T/.test(sent));
    if (!roster || !left || !sentOk || typeof n.date !== 'string' || !ISO_DATE.test(n.date) || nightDates.has(n.date)) {
      return { error: 'Invalid night' };
    }
    if (!roster.every((name) => playerNames.has(name)) || !left.every((name) => roster.includes(name))) return { error: 'Invalid night' };
    nightDates.add(n.date);
    nights.push({ date: n.date, players: roster, left, summarySent: sent });
  }

  const matchIds = new Set();
  const matches = [];
  for (const m of backup.matches) {
    if (!isRecord(m) || typeof m.matchId !== 'string' || !MATCH_ID.test(m.matchId) || m.matchId.split('#')[0] !== m.date
      || matchIds.has(m.matchId) || !validSeats(m)) {
      return { error: 'Invalid match' };
    }
    const match = { matchId: m.matchId, date: m.date };
    SEATS.forEach((seat) => { match[seat] = m[seat] == null ? '' : m[seat].trim(); });
    if (!SEATS.every((seat) => match[seat] === '' || playerNames.has(match[seat]))) return { error: 'Invalid match' };
    matchIds.add(m.matchId);
    matches.push(match);
  }

  const gameKeys = new Set();
  const games = [];
  for (const g of backup.games) {
    if (!isRecord(g) || typeof g.matchId !== 'string' || !matchIds.has(g.matchId) || !Number.isInteger(g.gameNo) || g.gameNo < 1
      || !RESULTS.includes(g.result) || typeof g.timestamp !== 'string' || g.timestamp.length > MAX_TIMESTAMP) {
      return { error: 'Invalid game' };
    }
    const key = `${g.matchId}|${g.gameNo}`;
    if (gameKeys.has(key)) return { error: 'Invalid game' };
    gameKeys.add(key);
    games.push({ matchId: g.matchId, gameNo: g.gameNo, result: g.result, timestamp: g.timestamp });
  }
  return { data: { players, nights, matches, games } };
}

/** True when none of Players, Nights, Matches and Games of the current league has a data row. */
function leagueIsEmpty() {
  return DATA_TABS.every((name) => dataRowCount(tab(name)) === 0);
}

/** Writes rows below the header of a tab in ONE setValues, adding sheet rows first when it is too short. */
function writeRows(name, rows) {
  if (rows.length === 0) return;
  const sheet = tab(name);
  const missing = rows.length + 1 - sheet.getMaxRows();
  if (missing > 0) sheet.insertRowsAfter(sheet.getMaxRows(), missing);
  sheet.getRange(2, 1, rows.length, TABS[name].length).setValues(rows);
}

/** Clears the data rows of a tab (values only: formats, checkboxes, validation and the status formula stay). */
function clearDataRows(sheet, name) {
  const rows = sheet.getMaxRows() - 1;
  if (rows > 0) sheet.getRange(2, 1, rows, TABS[name].length).clearContent();
}

/**
 * The weekly backup (run by a time trigger, see installBackupTrigger; also runnable from the
 * editor): ONE email to the script owner, and only the owner (a backup holds the players' email
 * addresses), with one JSON attachment per registered league, main first, and a Norwegian body
 * that lists name, id and row counts per league, or why a league failed. A league that cannot be
 * read is listed as failed and the others are still sent. Each league is read under the script
 * lock so a write cannot slip in half way through the snapshot. The mail goes against the daily
 * quota; with none left nothing is read or sent. The body holds no PIN and no sheet id.
 */
function sendBackups() {
  if (MailApp.getRemainingDailyQuota() < 1) {
    console.log('Backup not sent: the daily email quota is used up');
    return;
  }
  const ids = registeredLeagueIds();
  if (ids.length === 0) {
    console.log('Backup not sent: no leagues are registered');
    return;
  }
  const day = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const attachments = [];
  const lines = [];
  ids.forEach((id) => {
    const league = enterLeague(id);
    try {
      if (!league) throw new Error('Unknown league');
      const backup = readBackupLocked();
      attachments.push(Utilities.newBlob(JSON.stringify(backup, null, 2), 'application/json', `sjineser-${id}-${day}.json`));
      lines.push(`- ${backup.league.name} (${id}): ${backup.players.length} spillere, ${backup.nights.length} kvelder, `
        + `${backup.matches.length} sett, ${backup.games.length} spill`);
    } catch (err) {
      const reason = scrub(String(err && err.message ? err.message : err), league);
      lines.push(`- ${id}: feilet: ${reason}`);
      console.error(`Backup of league ${id} failed:`, reason);
    }
  });
  const body = `Sikkerhetskopi av Sjineser ${day}\n\n${lines.join('\n')}\n\n`
    + 'Hver vedlagte JSON-fil er én ligas data, inkludert spillernes e-postadresser, så ta vare på dem. '
    + 'Den kan leses inn igjen i en tom liga.\n';
  MailApp.sendEmail({ to: Session.getEffectiveUser().getEmail(), subject: `Sjineser sikkerhetskopi ${day}`, body, attachments });
  console.log(`Backup sent: ${attachments.length} of ${ids.length} leagues`);
}

/** readBackup() of the current league under the script lock. */
function readBackupLocked() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_TIMEOUT_MS)) throw new Error('Busy, try again');
  try {
    return readBackup();
  } finally {
    lock.releaseLock();
  }
}

/** An error message without the league's sheet id or PIN, should a service error ever quote them. */
function scrub(message, league) {
  return [league && league.sheetId, league && league.pin].filter(Boolean)
    .reduce((text, secret) => text.split(secret).join('…'), message);
}

/** The project's triggers that run sendBackups. */
function backupTriggers() {
  return ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === BACKUP_FUNCTION);
}

/**
 * Editor: makes sendBackups run weekly, Mondays between 06:00 and 07:00 (script time zone).
 * Idempotent: the existing sendBackups triggers are deleted first, so there is always exactly one.
 */
function installBackupTrigger() {
  backupTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger(BACKUP_FUNCTION).timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(6).create();
  console.log('Backup trigger installed: Mondays 06:00-07:00');
}

/** Editor: stops the weekly backup by deleting every sendBackups trigger. */
function removeBackupTrigger() {
  const triggers = backupTriggers();
  triggers.forEach((t) => ScriptApp.deleteTrigger(t));
  console.log(`Backup triggers removed: ${triggers.length}`);
}

// ---------- Leagues ----------

/** The league the current request works on: { id, name, main, sheetId, pin }. Set by enterLeague(). */
let currentLeague = null;

/**
 * Looks a league up by the id a client sent (absent, null or '' means main) and returns
 * { id, name, main, sheetId, pin }, or null when it is unknown; `name` is the registered default
 * (the live name is in Settings, see leagueName). The id is checked against LEAGUE_ID BEFORE any
 * property key is built from it, so a client can never make this read PIN, SHEET_ID or any other
 * reserved property. A registration that is not valid JSON, or lacks a non-empty string sheetId
 * or pin, or has a name that is not a string, counts as unknown; a blank name is just absent.
 * Main is resolved exactly like any other league, from LEAGUE_main.
 */
function resolveLeague(rawId) {
  const props = PropertiesService.getScriptProperties();
  const id = rawId == null || rawId === '' ? MAIN_LEAGUE : rawId;
  if (typeof id !== 'string' || !LEAGUE_ID.test(id)) return null;
  const main = id === MAIN_LEAGUE;
  const registration = props.getProperty(LEAGUE_PREFIX + id);
  if (registration == null) return null;
  let found;
  try {
    found = JSON.parse(registration);
  } catch (err) {
    return null;
  }
  const filled = (value) => typeof value === 'string' && value.trim() !== '';
  if (!found || !filled(found.sheetId) || !filled(found.pin)) return null;
  if (found.name != null && typeof found.name !== 'string') return null;
  const fallback = main ? DEFAULT_LEAGUE_NAME : id;
  return { id, main, name: filled(found.name) ? found.name.trim() : fallback, sheetId: found.sheetId, pin: found.pin };
}

/**
 * Makes `rawId` the league of this execution and returns it (null when unknown, and then no
 * league is current). Drops the cached spreadsheet, so several requests in one execution (tests,
 * prepareLeagues) never see each other's sheet.
 */
function enterLeague(rawId) {
  spreadsheetCache = null;
  currentLeague = resolveLeague(rawId);
  return currentLeague;
}

/**
 * Ids of all registered leagues: the suffix of every LEAGUE_<id> property, main first when
 * LEAGUE_main exists. Suffixes are NOT validated here, so a mistyped key (LEAGUE_Familie) shows up
 * in the editor logs as an invalid league instead of silently vanishing; resolveLeague() refuses them.
 */
function registeredLeagueIds() {
  const ids = PropertiesService.getScriptProperties().getKeys()
    .filter((key) => key.startsWith(LEAGUE_PREFIX))
    .map((key) => key.slice(LEAGUE_PREFIX.length));
  return ids.filter((id) => id === MAIN_LEAGUE).concat(ids.filter((id) => id !== MAIN_LEAGUE));
}

// ---------- Schema (lazy, versioned, per league) ----------

function schemaProperty() {
  return SCHEMA_PREFIX + currentLeague.id;
}

/** True when the current league's sheet was already prepared for SCHEMA_VERSION: one property read, no sheet access. */
function schemaCurrent() {
  return PropertiesService.getScriptProperties().getProperty(schemaProperty()) === String(SCHEMA_VERSION);
}

/**
 * Prepares the current league's spreadsheet when its stored schema version is behind (or always
 * with `force`), then stores SCHEMA_VERSION. The CALLER holds the script lock: preparing is a
 * burst of writes that must not interleave with another request's.
 */
function prepareLeague(force) {
  if (!force && schemaCurrent()) return;
  prepareSpreadsheet(spreadsheet(), currentLeague.name);
  PropertiesService.getScriptProperties().setProperty(schemaProperty(), String(SCHEMA_VERSION));
}

/**
 * Brings a spreadsheet to the full layout; idempotent, so it is safe on a live sheet and on a
 * half-prepared one: creates missing tabs, fills blank header cells (never overwrites a filled
 * one), bold + frozen header, text-format columns, Players checkboxes, the Matches status
 * formula and the seat validation, and seeds the Settings `name` with `defaultName` when the
 * sheet has none (blank counts as none; an existing name is never overwritten). Data rows are
 * never touched.
 */
function prepareSpreadsheet(ss, defaultName) {
  Object.keys(TABS).forEach((name) => {
    const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    const header = sheet.getRange(1, 1, 1, TABS[name].length);
    const cells = header.getValues()[0];
    const titles = TABS[name].map((title, i) => (String(cells[i] == null ? '' : cells[i]).trim() === '' ? title : cells[i]));
    header.setValues([titles]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    (TEXT_COLUMNS[name] || []).forEach((col) => sheet.getRange(col + ':' + col).setNumberFormat('@'));
  });
  const settings = ss.getSheetByName('Settings');
  if (!settingRows(settings).some((r) => r.key === 'name' && r.value !== '')) writeSetting(settings, 'name', defaultName);
  const players = ss.getSheetByName('Players');
  players.getRange('B2:B').insertCheckboxes();
  const matches = ss.getSheetByName('Matches');
  matches.getRange(STATUS_CELL).setFormula(STATUS_FORMULA);
  // Blank cells always pass data validation, so the optional third seats (A3, B3) may stay empty.
  matches.getRange(SEAT_RANGE).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInRange(players.getRange('A2:A'), true).setAllowInvalid(false).build(),
  );
}

// ---------- Editor functions (run by hand from the Apps Script editor) ----------

/**
 * Run once from the editor after a change that uses a new Google service: it touches every
 * service the web app needs, so Google asks the owner to approve them all. Sends nothing and
 * changes nothing; logs the results (league ids and names only, never PINs or sheet ids).
 */
function authorize() {
  enterLeague(MAIN_LEAGUE);
  console.log('Spreadsheet:', spreadsheet().getName());
  console.log('Owner:', Session.getEffectiveUser().getEmail());
  console.log('Time zone:', Session.getScriptTimeZone());
  console.log('Mail quota left today:', MailApp.getRemainingDailyQuota());
  console.log('Send count:', PropertiesService.getScriptProperties().getProperty(SENDS_PROPERTY));
  // Reading the triggers is what asks for the trigger permission that installBackupTrigger() needs.
  console.log('Backup triggers (0 = not installed):', backupTriggers().length);
  registeredLeagueIds().forEach((id) => {
    const league = enterLeague(id);
    console.log('League:', id, league ? nameOrDefault() : '(invalid registration)');
  });
}

/** The current league's name, or its registered default when its sheet cannot be read (editor logs only). */
function nameOrDefault() {
  try {
    return leagueName();
  } catch (err) {
    return currentLeague.name;
  }
}

/** Prepares the MAIN league's spreadsheet now (the same preparation the first request would run). */
function setup() {
  prepareNow(MAIN_LEAGUE);
}

/**
 * Prepares every registered league's spreadsheet now (main and each LEAGUE_<id>), so a new league
 * is ready, titled, and its first tap not slow. Logs one line per league: id, name, spreadsheet
 * title, number of Players rows (no secrets). A broken league is logged and skipped.
 */
function prepareLeagues() {
  registeredLeagueIds().forEach((id) => {
    try {
      const league = prepareNow(id);
      console.log(`League ${league.id} | ${leagueName()} | ${spreadsheet().getName()} | ${dataRowCount(tab('Players'))} players`);
    } catch (err) {
      console.error(`League ${id} failed:`, err && err.message ? err.message : err);
    }
  });
}

/** Forces the preparation of one league under the script lock; returns the league. Throws when it cannot. */
function prepareNow(id) {
  const league = enterLeague(id);
  if (!league) throw new Error('Unknown league');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_TIMEOUT_MS)) throw new Error('Busy, try again');
  try {
    prepareLeague(true);
  } finally {
    lock.releaseLock();
  }
  return league;
}

/**
 * DANGER: DELETES ALL DATA. Clears every data row (row 2 and down) of Players, Nights, Matches
 * and Games, every player, night, match and game, and keeps only the header rows. Settings is
 * configuration, not data: the league's name stays. There is no undo
 * apart from the spreadsheet's version history.
 *
 * Only for the one-off history import (spec §18): the owner runs it by hand from the Apps Script
 * editor, then runs setup(), then `npm run import:history -- --apply`. It is deliberately not in
 * HANDLERS, so neither doGet nor doPost can reach it. Clears values only (formats, checkboxes,
 * data validation and the status formula in I1 stay).
 */
function resetAllData() {
  enterLeague(MAIN_LEAGUE);
  DATA_TABS.forEach((name) => {
    const sheet = tab(name);
    if (sheet) clearDataRows(sheet, name);
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
