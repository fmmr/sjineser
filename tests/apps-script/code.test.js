import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SOURCE = readFileSync(new URL('../../apps-script/Code.js', import.meta.url), 'utf8');
const OWNER = 'owner@example.com';
const PIN = '1234';
const NIGHT = '2026-11-10';
/** SCHEMA_VERSION of Code.js; the tests that bump it must be updated on purpose. */
const SCHEMA = '2';

/** A sheet of rows (header first) with the slice of the Range/Sheet API Code.js uses. `log` records formatting calls. */
function fakeSheet(rows) {
  const log = [];
  const sheet = {
    rows,
    log,
    /** Number of getValues() calls (range reads) so far. */
    reads: 0,
    getMaxRows: () => rows.length,
    setFrozenRows: () => { log.push('setFrozenRows'); },
    insertRowsAfter: (after, count) => { for (let i = 0; i < count; i += 1) rows.push([]); },
    getRange: (row, column, count = 1, width = 1) => {
      const range = {
        getValues: () => {
          sheet.reads += 1;
          return rows.slice(row - 1, row - 1 + count)
            .map((cells) => Array.from({ length: width }, (_, i) => cells[column - 1 + i] ?? ''));
        },
        setValues: (values) => {
          values.forEach((cells, r) => cells.forEach((value, c) => {
            rows[row - 1 + r] ??= [];
            rows[row - 1 + r][column - 1 + c] = value;
          }));
          return range;
        },
        setValue: (value) => range.setValues([[value]]),
        clearContent: () => {
          for (let r = row - 1; r < row - 1 + count; r += 1) {
            for (let c = column - 1; c < column - 1 + width; c += 1) if (rows[r]) rows[r][c] = '';
          }
          return range;
        },
        setNumberFormat: () => { log.push('setNumberFormat'); return range; },
        setFontWeight: () => { log.push('setFontWeight'); return range; },
        insertCheckboxes: () => { log.push('insertCheckboxes'); return range; },
        setFormula: () => { log.push('setFormula'); return range; },
        setDataValidation: () => { log.push('setDataValidation'); return range; },
      };
      return range;
    },
  };
  return sheet;
}

/** A fake spreadsheet: `sheets` by tab name, a title, and a `log` of the calls that prepare it. */
function fakeSpreadsheet(sheets, title = 'Fotballkveld', { renameFails = false } = {}) {
  const spreadsheet = {
    sheets,
    title,
    log: [],
    getName: () => { spreadsheet.log.push('getName'); return spreadsheet.title; },
    rename: (next) => {
      spreadsheet.log.push('rename');
      if (renameFails) throw new Error('No permission');
      spreadsheet.title = next;
    },
    getSheetByName: (name) => sheets[name] ?? null,
    insertSheet: (name) => { spreadsheet.log.push(`insertSheet:${name}`); return (sheets[name] = fakeSheet([[]])); },
  };
  return spreadsheet;
}

const MAIN_PLAYERS = [
  ['Fredrik', true, 'fredrik@example.com'],
  ['Anne', true, 'anne@example.com'],
  ['Bjørn', false, 'bjorn@example.com'],
  ['Cato', true, ''],
  ['Dag', true, 'not-an-address'],
  ['Eva', 'TRUE', ' Eva@Example.com '],
];
const LEAGUE_PLAYERS = [
  ['Mari', true, 'mari@example.com'],
  ['Ola', true, 'ola@example.com'],
  ['Pia', false, 'pia@example.com'],
  ['Per', true, 'per@example.com'],
];

/** Settings rows, padded with blank rows like a real sheet (which has 1000), so a read is a real range read. */
const settingsRows = (settings) => [['key', 'value'], ...settings.map((r) => [...r]), ...Array.from({ length: 20 }, () => [])];

function standardSheets({ players = MAIN_PLAYERS, nights, nightsHeader = ['date', 'players', 'left', 'summarySent'], settings = [],
  matches = [], games = [] } = {}) {
  const roster = players.map((p) => p[0]).join(', ');
  return {
    Settings: fakeSheet(settingsRows(settings)),
    Players: fakeSheet([['name', 'active', 'email'], ...players.map((p) => [...p])]),
    Nights: fakeSheet([nightsHeader, ...(nights ?? [[NIGHT, roster, '', '']])]),
    Matches: fakeSheet([['matchId', 'date', 'A1', 'A2', 'A3', 'B1', 'B2', 'B3'], ...matches.map((m) => [...m])]),
    Games: fakeSheet([['matchId', 'gameNo', 'result', 'timestamp'], ...games.map((g) => [...g])]),
  };
}

/**
 * Loads Code.js with stubbed Apps Script services. Main league players: active with an address
 * (Fredrik, Anne, Eva with spaces and capitals), INACTIVE with an address (Bjørn), active without
 * one (Cato) and with a broken one (Dag).
 * `leagues` registers more leagues: { id: { name, pin, players, title, registration } } (each gets
 * its own fake spreadsheet 'sheet-<id>'; `registration` replaces the LEAGUE_<id> value).
 * `prepared: false` leaves every schema version unset, so the first request prepares the sheet.
 * `settings` / `leagues.<id>.settings` are the Settings rows of the sheet ([key, value] pairs).
 * `leagues.<id>` also takes `nights`, `matches` and `games` rows (`players: [], nights: []` makes an EMPTY league).
 * `triggers` lists the handler names of project triggers that already exist.
 * The main league is registered as LEAGUE_main ({ sheetId: 'sheet', pin: PIN }, no name) unless `props` replaces it;
 * a `props` value of null removes that property (`{ LEAGUE_main: null }` = no main league at all).
 */
function load({ quota = 100, today = '2026-11-11', sends = null, nights, nightsHeader, omitTabs = [], leagues = {},
  prepared = true, props = {}, mainTitle = 'Fotballkveld', renameFails = false, settings = [], triggers: initialTriggers = [] } = {}) {
  const sheets = standardSheets({ nights, nightsHeader, settings });
  omitTabs.forEach((name) => delete sheets[name]);
  const spreadsheets = { sheet: fakeSpreadsheet(sheets, mainTitle, { renameFails }) };
  const properties = {
    LEAGUE_main: JSON.stringify({ sheetId: 'sheet', pin: PIN }),
    ...(prepared ? { SCHEMA_main: SCHEMA } : {}), ...(sends ? { SUMMARY_SENDS: sends } : {}), ...props,
  };
  Object.keys(properties).forEach((key) => { if (properties[key] === null) delete properties[key]; });
  Object.entries(leagues).forEach(([id, league]) => {
    spreadsheets[`sheet-${id}`] = fakeSpreadsheet(standardSheets({ players: league.players ?? LEAGUE_PLAYERS, settings: league.settings, nights: league.nights, matches: league.matches, games: league.games }), league.title ?? 'Liga');
    properties[`LEAGUE_${id}`] = league.registration
      ?? JSON.stringify({ name: league.name ?? id, sheetId: `sheet-${id}`, pin: league.pin ?? `pin-${id}` });
    if (prepared) properties[`SCHEMA_${id}`] = SCHEMA;
  });
  const sent = [];
  const reads = [];
  const writes = [];
  const logs = [];
  /** Project triggers as { handler, calls } (calls = the builder steps that created it). */
  const triggers = initialTriggers.map((handler) => ({ handler, calls: [] }));
  const lock = { tries: 0, releases: 0, fail: false, onTry: null };
  const context = vm.createContext({
    console: { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' ')) },
    SpreadsheetApp: {
      openById: (id) => {
        if (!spreadsheets[id]) throw new Error('No item with the given ID could be found');
        return spreadsheets[id];
      },
      newDataValidation: () => {
        const builder = { requireValueInRange: () => builder, setAllowInvalid: () => builder, build: () => ({}) };
        return builder;
      },
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => { reads.push(key); return properties[key] ?? null; },
        setProperty: (key, value) => { writes.push(key); properties[key] = value; },
        getKeys: () => Object.keys(properties),
        deleteProperty: (key) => { writes.push(`delete:${key}`); delete properties[key]; },
      }),
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => { lock.tries += 1; lock.onTry?.(); return !lock.fail; },
        releaseLock: () => { lock.releases += 1; },
      }),
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (text) => ({ setMimeType: () => JSON.parse(text) }) },
    MailApp: { sendEmail: (message) => sent.push(message), getRemainingDailyQuota: () => quota },
    ScriptApp: {
      getProjectTriggers: () => triggers.map((spec) => ({ spec, getHandlerFunction: () => spec.handler })),
      deleteTrigger: (trigger) => { triggers.splice(triggers.indexOf(trigger.spec), 1); },
      newTrigger: (handler) => {
        const spec = { handler, calls: [] };
        const builder = {
          timeBased: () => { spec.calls.push('timeBased'); return builder; },
          onMonthDay: (day) => { spec.calls.push(`onMonthDay:${day}`); return builder; },
          atHour: (hour) => { spec.calls.push(`atHour:${hour}`); return builder; },
          create: () => { spec.calls.push('create'); triggers.push(spec); return {}; },
        };
        return builder;
      },
    },
    Session: { getEffectiveUser: () => ({ getEmail: () => OWNER }), getScriptTimeZone: () => 'Europe/Oslo' },
    Utilities: { formatDate: () => today, newBlob: (data, type, name) => ({ data, type, name }) },
  });
  const api = vm.runInContext(
    `${SOURCE}\n;({ doGet, doPost, summaryRecipients, countMissingEmails, setup, prepareLeagues, authorize, resetAllData, registeredLeagueIds,
  buildBackup, validateBackup, sendBackups, installBackupTrigger, removeBackupTrigger })`, context);
  const request = (action, payload, pin = PIN, league) => api.doPost({
    postData: { contents: JSON.stringify({ action, payload, pin, ...(league === undefined ? {} : { league }) }) },
  });
  const post = (payload, pin = PIN, league) => request('sendNightSummary', payload, pin, league);
  const get = (league) => api.doGet(league === undefined ? undefined : { parameter: { l: league } });
  return { ...api, post, request, get, sent, sheets, spreadsheets, properties, reads, writes, logs, lock, triggers };
}

/** Names in column A below the header (the fake grows in blocks of blank rows, as a real sheet does). */
const names = (sheet) => sheet.rows.slice(1).map((r) => r[0]).filter(Boolean);

const MAIL = {
  date: NIGHT, subject: 'Sjineser — kveld 10. nov. 2026', text: 'Kveld 10. nov. 2026', html: '<p>Kveld 10. nov. 2026</p>',
};

test('doGet never returns email addresses: players are only { name, active }', () => {
  const { doGet } = load();
  const body = doGet();
  assert.equal(body.ok, true);
  for (const player of body.data.players) assert.deepEqual(Object.keys(player), ['name', 'active']);
  assert.ok(!JSON.stringify(body).includes('@'));
});

test('summaryRecipients: only ACTIVE players with a valid address, trimmed and without duplicates', () => {
  const { summaryRecipients } = load();
  const players = [
    { name: 'Anne', active: true, email: 'anne@example.com' },
    { name: 'Bjørn', active: false, email: 'bjorn@example.com' },
    { name: 'Cato', active: true, email: '' },
    { name: 'Dag', active: true, email: 'dag@' },
    { name: 'Eva', active: true, email: ' eva@example.com ' },
    { name: 'Finn', active: true, email: 'ANNE@example.com' },
  ];
  assert.deepEqual([...summaryRecipients(players)], ['anne@example.com', 'eva@example.com']);
  assert.deepEqual([...summaryRecipients(players.filter((p) => !p.active || !p.email.includes('example')))], []);
});

test('summaryRecipients with a test player: only that player (any casing, active or not)', () => {
  const { summaryRecipients } = load();
  const players = [
    { name: 'Anne', active: true, email: 'anne@example.com' },
    { name: 'Bjørn', active: false, email: 'bjorn@example.com' },
    { name: 'Cato', active: true, email: '' },
  ];
  assert.deepEqual([...summaryRecipients(players, 'bjørn')], ['bjorn@example.com']);
  assert.deepEqual([...summaryRecipients(players, 'Cato')], []);
  assert.deepEqual([...summaryRecipients(players, 'Nobody')], []);
});

test('sendNightSummary: one HTML email with a text fallback to the owner, every active address in CC, the count back', () => {
  const { post, sent } = load();
  assert.deepEqual({ ...post(MAIL) }, { ok: true, result: 'applied', data: { recipients: 3, missing: 2 } });
  assert.equal(sent.length, 1);
  assert.deepEqual({ ...sent[0] }, {
    to: OWNER, cc: 'fredrik@example.com,anne@example.com,Eva@Example.com', subject: MAIL.subject, body: MAIL.text, htmlBody: MAIL.html,
  });
  assert.ok(!('bcc' in sent[0]), 'the players see each other: CC, not BCC');
  assert.ok(!sent[0].cc.includes('bjorn'), 'an inactive player never gets the summary');
  assert.ok(!sent[0].cc.toLowerCase().includes('cato') && !sent[0].cc.includes('not-an-address'), 'only valid addresses');
});

test('sendNightSummary with testPlayer: only that player, no CC, subject marked [TEST]', () => {
  const { post, sent } = load();
  assert.deepEqual({ ...post({ ...MAIL, testPlayer: 'fredrik' }) }, { ok: true, result: 'applied', data: { recipients: 1, missing: 0 } });
  assert.deepEqual({ ...sent[0] }, { to: 'fredrik@example.com', subject: `[TEST] ${MAIL.subject}`, body: MAIL.text, htmlBody: MAIL.html });
  assert.equal(post({ ...MAIL, testPlayer: 'Cato' }).message, 'Test player has no email');
  assert.equal(sent.length, 1);
});

test('sendNightSummary refuses a wrong PIN, an unknown night, an empty mail and a used-up quota', () => {
  const { post, sent } = load();
  assert.equal(post(MAIL, 'nope').error, 'pin');
  assert.equal(post({ ...MAIL, date: '2026-11-11' }).error, 'invalid');
  assert.equal(post({ ...MAIL, text: ' ' }).error, 'invalid');
  assert.equal(post({ ...MAIL, subject: 7 }).error, 'invalid');
  assert.equal(post({ ...MAIL, html: 7 }).error, 'invalid');
  assert.equal(post({ date: NIGHT, subject: MAIL.subject, text: MAIL.text }).error, 'invalid');
  assert.equal(load({ quota: 2 }).post(MAIL).error, 'quota');
  assert.equal(sent.length, 0);
});

test('sendNightSummary caps the subject at 200, the text at 20000 and the HTML at 100000 characters', () => {
  const { post, sent } = load();
  post({ ...MAIL, subject: 's'.repeat(300), text: 't'.repeat(30000), html: 'h'.repeat(150000) });
  assert.equal(sent[0].subject.length, 200);
  assert.equal(sent[0].body.length, 20000);
  assert.equal(sent[0].htmlBody.length, 100000);
});

test('schema preparation: an older Nights tab gets the summarySent header by itself, without setup()', () => {
  const { get, sheets } = load({ prepared: false, nightsHeader: ['date', 'players', 'left'], nights: [[NIGHT, 'Fredrik, Anne, Cato, Dag', '']] });
  const body = get();
  assert.deepEqual([...sheets.Nights.rows[0]], ['date', 'players', 'left', 'summarySent']);
  assert.equal(body.data.nights[0].summarySent, '');
});

test('sendNightSummary stamps the night; a second real send is refused and sends nothing', () => {
  const { post, sent, sheets, doGet } = load();
  assert.equal(post(MAIL).ok, true);
  const stamp = sheets.Nights.rows[1][3];
  assert.match(stamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  assert.equal(doGet().data.nights[0].summarySent, stamp, 'the app sees when it was sent');
  assert.deepEqual({ ...post(MAIL) }, { ok: false, error: 'conflict', message: 'Summary already sent' });
  assert.equal(sent.length, 1);
});

test('sendNightSummary: test sends ignore the stamp and never set it', () => {
  const { post, sent, sheets } = load();
  assert.equal(post({ ...MAIL, testPlayer: 'Fredrik' }).ok, true);
  assert.equal(sheets.Nights.rows[1][3], '', 'a test send does not stamp');
  assert.equal(post(MAIL).ok, true);
  assert.equal(post({ ...MAIL, testPlayer: 'Fredrik' }).ok, true, 'a test send after the real one still works');
  assert.equal(sent.length, 3);
});

test('sendNightSummary: at most 3 real sends a day across all nights', () => {
  const dates = ['2026-11-01', '2026-11-03', '2026-11-05', '2026-11-10'];
  const { post, sent, properties } = load({ nights: dates.map((date) => [date, 'Fredrik, Anne, Cato, Dag', '', '']) });
  for (const date of dates.slice(0, 3)) assert.equal(post({ ...MAIL, date }).ok, true, date);
  assert.equal(properties.SUMMARY_SENDS, '2026-11-11:3');
  assert.deepEqual({ ...post({ ...MAIL, date: dates[3] }) }, { ok: false, error: 'quota', message: 'Daily send limit reached' });
  assert.equal(post({ ...MAIL, date: dates[3], testPlayer: 'Fredrik' }).ok, true, 'test sends do not count');
  assert.equal(sent.length, 4);
});

test('sendNightSummary: the daily count starts again on a new day', () => {
  const { post, properties } = load({ sends: '2026-11-10:3' });
  assert.equal(post(MAIL).ok, true);
  assert.equal(properties.SUMMARY_SENDS, '2026-11-11:1');
});

// ---------- Leagues ----------

const FAMILIE = { familie: { name: 'Familie', pin: '9999' } };
const FORMATTING = ['setFontWeight', 'setFrozenRows', 'insertCheckboxes', 'setFormula', 'setDataValidation'];
const formatCalls = (sheets) => Object.values(sheets).flatMap((sheet) => sheet.log.filter((call) => FORMATTING.includes(call)));

test('main league: no league, an empty one and "main" all read the main sheet, named Sjineser by default', () => {
  const { get, doGet } = load();
  const expected = { id: 'main', name: 'Sjineser', main: true };
  for (const body of [get(), doGet({}), doGet({ parameter: {} }), get(''), get('main')]) {
    assert.equal(body.ok, true);
    assert.deepEqual({ ...body.data.league }, expected);
    assert.equal(body.data.players.length, 6);
  }
});

test('main league: a write without a league uses the main PIN and the main sheet, as before', () => {
  const { request, sheets } = load({ leagues: FAMILIE });
  assert.deepEqual({ ...request('addPlayer', { name: 'Gro' }) }, { ok: true, result: 'applied', data: { name: 'Gro' } });
  assert.deepEqual(names(sheets.Players).at(-1), 'Gro');
  assert.equal(request('addPlayer', { name: 'Hans' }, 'wrong').error, 'pin');
  assert.equal(request('addPlayer', { name: 'Hans' }, PIN, null).ok, true, 'a null league is main');
  assert.equal(request('addPlayer', { name: 'Ida' }, PIN, '').ok, true, 'an empty league is main');
  assert.equal(request('addPlayer', { name: 'Jon' }, PIN, 'main').ok, true);
});

test('main league registered without a PIN is unknown, so every write is refused', () => {
  const bare = load({ props: { LEAGUE_main: JSON.stringify({ sheetId: 'sheet' }) } });
  for (const pin of [undefined, '', 'null']) {
    assert.deepEqual({ ...bare.request('addPlayer', { name: 'Gro' }, pin) }, { ok: false, error: 'invalid', message: 'Unknown league' });
  }
  assert.equal(names(bare.sheets.Players).length, 6);
});

test('a registered league reads its own sheet and says who it is', () => {
  const { get } = load({ leagues: FAMILIE });
  const body = get('familie');
  assert.equal(body.ok, true);
  assert.deepEqual({ ...body.data.league }, { id: 'familie', name: 'Familie', main: false });
  assert.deepEqual(body.data.players.map((p) => p.name), ['Mari', 'Ola', 'Pia', 'Per']);
  assert.deepEqual(get().data.players.map((p) => p.name).slice(0, 2), ['Fredrik', 'Anne']);
});

test('a write in one league touches only that league\'s sheet', () => {
  const { request, sheets, spreadsheets } = load({ leagues: FAMILIE });
  const familie = spreadsheets['sheet-familie'].sheets;
  const mainBefore = JSON.stringify(Object.values(sheets).map((s) => s.rows));
  assert.deepEqual({ ...request('addPlayer', { name: 'Sol' }, '9999', 'familie') }, { ok: true, result: 'applied', data: { name: 'Sol' } });
  assert.deepEqual(names(familie.Players).at(-1), 'Sol');
  assert.equal(JSON.stringify(Object.values(sheets).map((s) => s.rows)), mainBefore, 'main is untouched');
  assert.equal(request('addPlayer', { name: 'Sol' }, PIN).result, 'applied', 'main has no Sol yet');
});

test('an unknown or malformed league is "Unknown league" and no other property is read', () => {
  const ctx = load({ leagues: FAMILIE, props: { SHEET_ID: 'sheet', NAME: 'Stua' } });
  const bad = ['PIN', 'SHEET_ID', 'NAME', '../x', 'Familie', 'FAMILIE', 'ab', 'x'.repeat(41), '-abc', 'a b', 'a_b', 'LEAGUE_familie', 5, true, {}, ['familie']];
  for (const league of bad) {
    ctx.reads.length = 0;
    const get = ctx.get(league);
    assert.deepEqual({ ...get }, { ok: false, error: 'invalid', message: 'Unknown league' }, `GET ${JSON.stringify(league)}`);
    const post = ctx.request('addPlayer', { name: 'Gro' }, PIN, league);
    assert.deepEqual({ ...post }, { ok: false, error: 'invalid', message: 'Unknown league' }, `POST ${JSON.stringify(league)}`);
    assert.deepEqual(ctx.reads, [], `no property read for ${JSON.stringify(league)}`);
  }
  ctx.reads.length = 0;
  assert.equal(ctx.get('nobody').error, 'invalid');
  assert.deepEqual(ctx.reads, ['LEAGUE_nobody'], 'a well-formed unknown id only reads its own key');
  assert.equal(ctx.request('addPlayer', { name: 'Gro' }, 'wrong-pin', 'nobody').message, 'Unknown league', 'league before PIN');
  assert.equal(names(ctx.sheets.Players).length, 6);
});

test('the main PIN does not open a league and a league PIN does not open main', () => {
  const { request, sheets, spreadsheets } = load({ leagues: FAMILIE });
  assert.equal(request('addPlayer', { name: 'Gro' }, PIN, 'familie').error, 'pin');
  assert.equal(request('addPlayer', { name: 'Gro' }, '9999').error, 'pin');
  assert.equal(request('addPlayer', { name: 'Gro' }, '9999', 'main').error, 'pin');
  assert.equal(request('addPlayer', { name: 'Gro' }, undefined, 'familie').error, 'pin');
  assert.equal(names(sheets.Players).length, 6);
  assert.equal(names(spreadsheets['sheet-familie'].sheets.Players).length, 4);
});

test('a league registration that is not valid is an unknown league', () => {
  const good = { name: 'X', sheetId: 's', pin: 'p' };
  const registrations = {
    garbage: 'not json', nullish: 'null', array: '[]', number: '7', empty: '',
    nopin: JSON.stringify({ ...good, pin: undefined }), blankpin: JSON.stringify({ ...good, pin: '  ' }),
    nosheet: JSON.stringify({ ...good, sheetId: undefined }),
    numpin: JSON.stringify({ ...good, pin: 1234 }), numname: JSON.stringify({ ...good, name: 5 }),
    objname: JSON.stringify({ ...good, name: { a: 1 } }), emptysheet: JSON.stringify({ ...good, sheetId: '' }),
  };
  const leagues = Object.fromEntries(Object.entries(registrations).map(([id, registration]) => [`bad-${id}`, { registration }]));
  const ctx = load({ leagues });
  for (const id of Object.keys(leagues)) {
    assert.equal(ctx.get(id).message, 'Unknown league', id);
    assert.equal(ctx.request('addPlayer', { name: 'Gro' }, 'p', id).message, 'Unknown league', id);
  }
});

test('GET of a league carries league info but never an address', () => {
  const { get } = load({ leagues: FAMILIE });
  for (const body of [get('familie'), get()]) {
    assert.equal(body.ok, true);
    for (const player of body.data.players) assert.deepEqual(Object.keys(player), ['name', 'active']);
    assert.ok(!JSON.stringify(body).includes('@'));
  }
});

// ---------- Lazy schema ----------

test('schema fast path: a matching version prepares nothing, takes no lock and writes no property', () => {
  const { get, request, spreadsheets, lock, writes } = load({ leagues: FAMILIE });
  assert.equal(get().ok, true);
  assert.equal(get('familie').ok, true);
  assert.equal(lock.tries, 0, 'GET takes no lock when the sheet is ready');
  assert.equal(request('addPlayer', { name: 'Gro' }).ok, true);
  assert.equal(lock.tries, 1, 'only the POST lock');
  for (const ss of Object.values(spreadsheets)) {
    assert.deepEqual(ss.log, [], 'no getName, rename or insertSheet');
    assert.deepEqual(formatCalls(ss.sheets), []);
  }
  assert.deepEqual(writes, []);
});

test('schema mismatch: the first GET prepares the sheet under the lock and stamps the version, once', () => {
  const { get, sheets, lock, properties, writes } = load({ prepared: false });
  assert.equal(get().ok, true);
  assert.equal(properties.SCHEMA_main, SCHEMA);
  assert.deepEqual(writes, ['SCHEMA_main']);
  assert.equal(lock.tries, 1);
  assert.equal(lock.releases, 1);
  assert.ok(formatCalls(sheets).length > 0, 'the sheet was prepared');
  const after = formatCalls(sheets).length;
  assert.equal(get().ok, true);
  assert.equal(formatCalls(sheets).length, after, 'not prepared again');
  assert.equal(lock.tries, 1);
});

test('schema: a stale version (older than SCHEMA_VERSION) counts as behind', () => {
  const { get, properties, lock } = load({ props: { SCHEMA_main: '0' } });
  assert.equal(get().ok, true);
  assert.equal(properties.SCHEMA_main, SCHEMA);
  assert.equal(lock.tries, 1);
});

test('schema: each league has its own version; preparing one leaves the others alone', () => {
  const { get, properties, spreadsheets } = load({ prepared: false, leagues: FAMILIE });
  assert.equal(get('familie').ok, true);
  assert.equal(properties.SCHEMA_familie, SCHEMA);
  assert.equal(properties.SCHEMA_main, undefined);
  assert.deepEqual(formatCalls(spreadsheets.sheet.sheets), []);
});

test('schema: a GET that cannot get the lock while the sheet is behind answers busy', () => {
  const { get, lock, properties } = load({ prepared: false });
  lock.fail = true;
  assert.deepEqual({ ...get() }, { ok: false, error: 'busy', message: 'Busy, try again' });
  assert.equal(properties.SCHEMA_main, undefined);
});

test('schema: a GET re-checks the version after getting the lock (another request just prepared it)', () => {
  const { get, lock, properties, sheets, writes } = load({ prepared: false });
  lock.onTry = () => { properties.SCHEMA_main = SCHEMA; };
  assert.equal(get().ok, true);
  assert.deepEqual(formatCalls(sheets), []);
  assert.deepEqual(writes, []);
  assert.equal(lock.releases, 1);
});

test('schema: a POST prepares inside the lock it already holds, without taking it again', () => {
  const { request, lock, properties, sheets } = load({ prepared: false });
  assert.equal(request('addPlayer', { name: 'Gro' }).result, 'applied');
  assert.equal(lock.tries, 1);
  assert.equal(lock.releases, 1);
  assert.equal(properties.SCHEMA_main, SCHEMA);
  assert.ok(formatCalls(sheets).length > 0);
});

test('schema: a missing tab is created with its header, and an existing header is only completed', () => {
  const { get, spreadsheets, sheets } = load({
    prepared: false, omitTabs: ['Games'], nightsHeader: ['Dato', 'players', ''],
  });
  assert.equal(get().ok, true);
  assert.deepEqual(spreadsheets.sheet.log.filter((call) => call.startsWith('insertSheet')), ['insertSheet:Games']);
  assert.deepEqual([...spreadsheets.sheet.sheets.Games.rows[0]], ['matchId', 'gameNo', 'result', 'timestamp']);
  assert.deepEqual([...sheets.Nights.rows[0]], ['Dato', 'players', 'left', 'summarySent'], 'blank cells filled, a custom one kept');
  assert.equal(sheets.Nights.rows.length, 2, 'data rows are untouched');
  assert.deepEqual(sheets.Players.log.filter((call) => call === 'insertCheckboxes'), ['insertCheckboxes']);
  assert.ok(sheets.Matches.log.includes('setFormula') && sheets.Matches.log.includes('setDataValidation'));
});

// ---------- Editor functions ----------

test('setup() prepares the main league only, even when it is already marked as prepared', () => {
  const { setup, properties, spreadsheets, lock } = load({ leagues: FAMILIE });
  setup();
  assert.ok(formatCalls(spreadsheets.sheet.sheets).length > 0);
  assert.deepEqual(formatCalls(spreadsheets['sheet-familie'].sheets), []);
  assert.equal(properties.SCHEMA_main, SCHEMA);
  assert.equal(lock.tries, 1);
  assert.equal(lock.releases, 1);
});

test('prepareLeagues(): prepares main and every league, logs one line each, and carries on past a broken league', () => {
  const { prepareLeagues, logs, properties, spreadsheets, lock } = load({
    prepared: false,
    leagues: {
      familie: { name: 'Familie', pin: 'pin-secret-1', title: 'Untitled spreadsheet' },
      broken: { registration: 'not json' },
      gone: { name: 'Borte', pin: 'pin-secret-2', registration: JSON.stringify({ name: 'Borte', sheetId: 'sheet-missing', pin: 'pin-secret-2' }) },
      venner: { name: 'Venner', pin: 'pin-secret-3', players: LEAGUE_PLAYERS.slice(0, 2) },
    },
    props: { LEAGUE_Typo: JSON.stringify({ name: 'T', sheetId: 'sheet', pin: 'p' }) },
  });
  assert.doesNotThrow(() => prepareLeagues());
  const text = logs.join('\n');
  assert.match(text, /League main \| Sjineser \| Fotballkveld \| 6 players/);
  assert.match(text, /League familie \| Familie \| Untitled spreadsheet \| 4 players/);
  assert.match(text, /League venner \| Venner \| Liga \| 2 players/);
  assert.match(text, /League broken failed/);
  assert.match(text, /League gone failed/);
  assert.match(text, /League Typo failed/, 'a mistyped key is reported, not silently skipped');
  assert.equal(spreadsheets['sheet-familie'].title, 'Untitled spreadsheet', 'titles are never changed (needs full Drive access)');
  for (const id of ['main', 'familie', 'venner']) assert.equal(properties[`SCHEMA_${id}`], SCHEMA, id);
  for (const id of ['broken', 'gone', 'Typo']) assert.equal(properties[`SCHEMA_${id}`], undefined, id);
  assert.equal(lock.tries, lock.releases, 'every lock taken is released');
  for (const secret of ['pin-secret', PIN, 'sheet-familie', 'sheet-venner', 'sheet-missing']) {
    assert.ok(!text.includes(secret), `no secret in the log: ${secret}`);
  }
});

test('authorize() logs league ids and names but never a PIN or a sheet id', () => {
  const { authorize, logs } = load({ leagues: { familie: { name: 'Familie', pin: 'pin-secret-1' }, broken: { registration: '{' } } });
  authorize();
  const text = logs.join('\n');
  assert.match(text, /League: main Sjineser/);
  assert.match(text, /League: familie Familie/);
  assert.match(text, /League: broken \(invalid registration\)/);
  assert.ok(!text.includes('pin-secret') && !text.includes('sheet-familie') && !text.includes(PIN));
});

test('resetAllData() clears the main league only', () => {
  const { resetAllData, sheets, spreadsheets } = load({ leagues: FAMILIE });
  resetAllData();
  assert.deepEqual(sheets.Players.rows.map((r) => r[0]), ['name', '', '', '', '', '', '']);
  assert.equal(spreadsheets['sheet-familie'].sheets.Players.rows[1][0], 'Mari');
});

// ---------- sendNightSummary in leagues ----------

test('sendNightSummary in a league: its own PIN, sender name, counter and Nights stamp; mail still from the owner', () => {
  const { post, sent, properties, sheets, spreadsheets } = load({ leagues: FAMILIE });
  assert.equal(post(MAIL, PIN, 'familie').error, 'pin', 'the main PIN is not enough');
  assert.deepEqual({ ...post(MAIL, '9999', 'familie') }, { ok: true, result: 'applied', data: { recipients: 3, missing: 0 } });
  assert.deepEqual({ ...sent[0] }, {
    to: OWNER, cc: 'mari@example.com,ola@example.com,per@example.com', subject: MAIL.subject,
    body: MAIL.text, htmlBody: MAIL.html, name: 'Familie',
  });
  assert.equal(properties.SUMMARY_SENDS_familie, '2026-11-11:1');
  assert.equal(properties.SUMMARY_SENDS, undefined, 'main counter untouched');
  assert.match(spreadsheets['sheet-familie'].sheets.Nights.rows[1][3], /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(sheets.Nights.rows[1][3], '', 'main night not stamped');
  assert.equal(post(MAIL, '9999', 'familie').error, 'conflict');
});

test('sendNightSummary in the main league sends without a sender name', () => {
  const { post, sent } = load({ leagues: FAMILIE });
  post(MAIL);
  assert.ok(!('name' in sent[0]));
});

test('sendNightSummary: the daily cap is counted per league', () => {
  const both = load({ leagues: FAMILIE, sends: '2026-11-11:3', props: { SUMMARY_SENDS_familie: '2026-11-11:3' } });
  assert.equal(both.post(MAIL, PIN).error, 'quota', 'main is at its cap');
  assert.equal(both.post(MAIL, '9999', 'familie').error, 'quota', 'familie is at its cap');
  assert.equal(both.sent.length, 0);

  const mainFull = load({ leagues: FAMILIE, sends: '2026-11-11:3' });
  assert.equal(mainFull.post(MAIL, '9999', 'familie').ok, true, 'a full main counter does not block a league');
  assert.equal(mainFull.properties.SUMMARY_SENDS, '2026-11-11:3');
  assert.equal(mainFull.properties.SUMMARY_SENDS_familie, '2026-11-11:1');

  const leagueFull = load({ leagues: FAMILIE, props: { SUMMARY_SENDS_familie: '2026-11-11:3' } });
  assert.equal(leagueFull.post(MAIL).ok, true, 'a full league counter does not block main');
  assert.equal(leagueFull.properties.SUMMARY_SENDS, '2026-11-11:1');
  assert.equal(leagueFull.properties.SUMMARY_SENDS_familie, '2026-11-11:3');
});

test('sendNightSummary: a test send is refused in every league and sends nothing', () => {
  const { post, sent, spreadsheets } = load({ leagues: FAMILIE });
  assert.deepEqual({ ...post({ ...MAIL, testPlayer: 'Mari' }, '9999', 'familie') },
    { ok: false, error: 'invalid', message: 'Test send is only for the main league' });
  assert.equal(sent.length, 0);
  assert.equal(spreadsheets['sheet-familie'].sheets.Nights.rows[1][3], '');
  assert.equal(post({ ...MAIL, testPlayer: 'Fredrik' }).ok, true, 'still fine in main');
});

test('sendNightSummary: `missing` counts active players without a usable address; duplicates and inactive players do not count', () => {
  const players = [
    ['Mari', true, 'mari@example.com'],
    ['Mia', true, ' MARI@example.com '], // the same address again: deduped, not missing
    ['Ola', true, ''],
    ['Per', true, 'per@'],
    ['Pia', 'TRUE', '   '],
    ['Rolf', false, ''], // inactive: never counted
    ['Sara', false, 'bad'],
    ['Tor', true, 'tor@example.com'],
  ];
  const { post, sent } = load({ leagues: { familie: { name: 'Familie', pin: '9999', players } } });
  assert.deepEqual({ ...post(MAIL, '9999', 'familie') }, { ok: true, result: 'applied', data: { recipients: 2, missing: 3 } });
  assert.equal(sent[0].cc, 'mari@example.com,tor@example.com');
});

test('sendNightSummary: nobody with an address is "No recipients", not a crash', () => {
  const none = [['Ola', true, ''], ['Per', true, 'x'], ['Pia', false, 'pia@example.com']];
  const { post, sent, spreadsheets, properties } = load({ leagues: { familie: { name: 'Familie', pin: '9999', players: none } } });
  assert.deepEqual({ ...post(MAIL, '9999', 'familie') }, { ok: false, error: 'invalid', message: 'No recipients' });
  assert.equal(sent.length, 0);
  assert.equal(spreadsheets['sheet-familie'].sheets.Nights.rows[1][3], '', 'nothing stamped');
  assert.equal(properties.SUMMARY_SENDS_familie, undefined);
});

test('countMissingEmails: only ACTIVE players with a blank or invalid address', () => {
  const { countMissingEmails } = load();
  assert.equal(countMissingEmails([
    { active: true, email: 'a@example.com' }, { active: true, email: '' }, { active: true, email: 'nope' },
    { active: true, email: null }, { active: false, email: '' }, { active: true, email: 'a@example.com' },
  ]), 3);
  assert.equal(countMissingEmails([]), 0);
});

// ---------- LEAGUE_main ----------

const MAIN_REGISTRATION = (extra = {}) => JSON.stringify({ sheetId: 'sheet', pin: 'main-pin', ...extra });

test('LEAGUE_main is the main league: its sheet and PIN, name optional (default Sjineser)', () => {
  const { get, request, sheets } = load({ props: { LEAGUE_main: MAIN_REGISTRATION() } });
  assert.deepEqual({ ...get().data.league }, { id: 'main', name: 'Sjineser', main: true });
  assert.equal(request('addPlayer', { name: 'Gro' }, PIN).error, 'pin', 'only the registered PIN opens it');
  assert.equal(request('addPlayer', { name: 'Gro' }, 'main-pin').result, 'applied');
  assert.equal(request('addPlayer', { name: 'Hans' }, 'main-pin', 'main').result, 'applied');
  assert.deepEqual(names(sheets.Players).slice(-2), ['Gro', 'Hans']);
  assert.equal(load({ props: { LEAGUE_main: MAIN_REGISTRATION({ name: 'Stua' }) } }).get().data.league.name, 'Stua', 'registered name is the default');
  assert.equal(load({ props: { LEAGUE_main: MAIN_REGISTRATION({ name: '  ' }) } }).get().data.league.name, 'Sjineser', 'a blank name is absent');
});

test('LEAGUE_main can point at any registered sheet, like any other league', () => {
  const ctx = load({ leagues: { other: { name: 'Other' } }, props: { LEAGUE_main: JSON.stringify({ sheetId: 'sheet-other', pin: 'other-pin' }) } });
  assert.deepEqual(ctx.get().data.players.map((p) => p.name), ['Mari', 'Ola', 'Pia', 'Per']);
  assert.equal(ctx.request('addPlayer', { name: 'Hans' }, PIN).error, 'pin');
  assert.equal(ctx.request('addPlayer', { name: 'Gro' }, 'other-pin').result, 'applied');
  assert.equal(names(ctx.sheets.Players).length, 6, 'the default main sheet is untouched');
});

test('an invalid LEAGUE_main is an unknown league', () => {
  const registrations = ['not json', 'null', '', JSON.stringify({ pin: 'p' }), JSON.stringify({ sheetId: 'sheet' }),
    JSON.stringify({ sheetId: 'sheet', pin: PIN, name: 5 })];
  for (const registration of registrations) {
    const ctx = load({ props: { LEAGUE_main: registration } });
    assert.deepEqual({ ...ctx.get() }, { ok: false, error: 'invalid', message: 'Unknown league' }, registration);
    assert.equal(ctx.get('main').message, 'Unknown league');
    assert.equal(ctx.request('addPlayer', { name: 'Gro' }, PIN).message, 'Unknown league', registration);
    assert.equal(names(ctx.sheets.Players).length, 6);
  }
});

test('without LEAGUE_main there is no main league: GET and POST are "Unknown league" and SHEET_ID, PIN and NAME are ignored', () => {
  const ctx = load({ props: { LEAGUE_main: null, SHEET_ID: 'sheet', PIN, NAME: 'Stua' } });
  assert.equal(ctx.properties.LEAGUE_main, undefined);
  const unknown = { ok: false, error: 'invalid', message: 'Unknown league' };
  for (const league of [undefined, '', 'main']) {
    ctx.reads.length = 0;
    assert.deepEqual({ ...ctx.get(league) }, unknown, `GET ${JSON.stringify(league)}`);
    assert.deepEqual({ ...ctx.request('addPlayer', { name: 'Gro' }, PIN, league) }, unknown, `POST ${JSON.stringify(league)}`);
    assert.ok(!ctx.reads.some((key) => ['SHEET_ID', 'PIN', 'NAME'].includes(key)), 'the flat properties are never read');
  }
  assert.equal(names(ctx.sheets.Players).length, 6);
});

test('prepareLeagues() logs an invalid LEAGUE_main as failed and prepares nothing for it', () => {
  const { prepareLeagues, logs, properties, spreadsheets } = load({ prepared: false, props: { LEAGUE_main: '{' } });
  prepareLeagues();
  assert.match(logs.join('\n'), /League main failed: Unknown league/);
  assert.equal(properties.SCHEMA_main, undefined);
  assert.deepEqual(formatCalls(spreadsheets.sheet.sheets), []);
});

test('registeredLeagueIds(): main first when LEAGUE_main exists, otherwise just not listed', () => {
  assert.deepEqual([...load({ leagues: FAMILIE }).registeredLeagueIds()], ['main', 'familie']);
  assert.deepEqual([...load({ props: { LEAGUE_zeta: '{', LEAGUE_aaa: '{' } }).registeredLeagueIds()], ['main', 'zeta', 'aaa']);
  assert.deepEqual([...load({ leagues: FAMILIE, props: { LEAGUE_main: null } }).registeredLeagueIds()], ['familie']);
  assert.deepEqual([...load({ props: { LEAGUE_main: null } }).registeredLeagueIds()], []);
});

test('prepareLeagues() prepares a LEAGUE_main main league like any other', () => {
  const { prepareLeagues, logs, properties } = load({ prepared: false, leagues: FAMILIE, props: { LEAGUE_main: MAIN_REGISTRATION({ name: 'Stua' }) } });
  prepareLeagues();
  assert.match(logs.join('\n'), /League main \| Stua \| Fotballkveld \| 6 players/);
  assert.equal(properties.SCHEMA_main, SCHEMA);
  assert.equal(properties.SCHEMA_familie, SCHEMA);
});

// ---------- Settings: the league name ----------

/** The [key, value] rows of a Settings sheet (blank padding skipped). */
const settingsOf = (sheet) => sheet.rows.slice(1).filter((r) => r[0]).map((r) => [r[0], r[1]]);

test('schema v2: a version 1 sheet gets its Settings tab once, with the name seeded and the data untouched', () => {
  const ctx = load({ omitTabs: ['Settings'], props: { SCHEMA_main: '1' } });
  const data = () => JSON.stringify(['Players', 'Nights', 'Matches', 'Games'].map((n) => ctx.sheets[n].rows));
  const dataBefore = data();
  assert.equal(ctx.get().ok, true);
  assert.deepEqual(ctx.spreadsheets.sheet.log.filter((c) => c.startsWith('insertSheet')), ['insertSheet:Settings']);
  const settings = ctx.spreadsheets.sheet.sheets.Settings;
  assert.deepEqual([...settings.rows[0]], ['key', 'value']);
  assert.deepEqual(settingsOf(settings), [['name', 'Sjineser']]);
  assert.ok(settings.log.includes('setFontWeight') && settings.log.includes('setFrozenRows'), 'bold, frozen header');
  assert.equal(ctx.properties.SCHEMA_main, SCHEMA);
  assert.equal(data(), dataBefore);
  const prepared = formatCalls(ctx.spreadsheets.sheet.sheets).length;
  ctx.get();
  assert.equal(formatCalls(ctx.spreadsheets.sheet.sheets).length, prepared, 'only once');
});

test('Settings name is seeded from the registered name, else the id, else Sjineser; never overwritten, blank counts as absent', () => {
  const { get, spreadsheets } = load({
    prepared: false,
    leagues: {
      familie: { name: 'Familie' },
      bare: { registration: JSON.stringify({ sheetId: 'sheet-bare', pin: 'p' }) },
      own: { name: 'Registered', settings: [['name', 'Mitt navn']] },
      blank: { name: 'Fra property', settings: [['name', '   ']] },
      extra: { name: 'Ekstra', settings: [['theme', 'dark']] },
    },
  });
  for (const id of ['familie', 'bare', 'own', 'blank', 'extra']) assert.equal(get(id).ok, true, id);
  const seeded = (id) => settingsOf(spreadsheets[`sheet-${id}`].sheets.Settings);
  assert.deepEqual(seeded('familie'), [['name', 'Familie']]);
  assert.deepEqual(seeded('bare'), [['name', 'bare']]);
  assert.deepEqual(seeded('own'), [['name', 'Mitt navn']], 'an existing name is kept');
  assert.deepEqual(seeded('blank'), [['name', 'Fra property']], 'the blank row is filled in, not duplicated');
  assert.deepEqual(seeded('extra'), [['theme', 'dark'], ['name', 'Ekstra']], 'other rows are untouched');
  assert.equal(get('own').data.league.name, 'Mitt navn');
  assert.equal(get().data.league.name, 'Sjineser');
});

test('re-preparing (setup, prepareLeagues) keeps a changed name', () => {
  const { setup, prepareLeagues, request, get, spreadsheets } = load();
  assert.equal(request('setLeagueName', { name: 'Stua' }, PIN).result, 'applied');
  setup();
  prepareLeagues();
  assert.deepEqual(settingsOf(spreadsheets.sheet.sheets.Settings), [['name', 'Stua']]);
  assert.equal(get().data.league.name, 'Stua');
});

test('the Settings name wins over the registered one: GET returns it and the mail sender uses it', () => {
  const { get, post, sent } = load({ leagues: { familie: { name: 'Familie', pin: '9999', settings: [['name', 'Slekta']] } } });
  assert.deepEqual({ ...get('familie').data.league }, { id: 'familie', name: 'Slekta', main: false });
  assert.equal(post(MAIL, '9999', 'familie').ok, true);
  assert.equal(sent[0].name, 'Slekta');
  const main = load({ settings: [['name', 'Stua']] });
  assert.equal(main.get().data.league.name, 'Stua');
  main.post(MAIL);
  assert.ok(!('name' in main.sent[0]), 'main still sends without a sender name');
});

test('a blank Settings name falls back to the registered name', () => {
  const { get } = load({ leagues: { familie: { name: 'Familie', settings: [['name', ' ']] } } });
  assert.equal(get('familie').data.league.name, 'Familie');
});

test('reading the name costs one small range read of Settings per GET and opens nothing new', () => {
  const { get, sheets, spreadsheets } = load();
  get();
  assert.equal(sheets.Settings.reads, 1);
  assert.deepEqual(spreadsheets.sheet.log, []);
});

test('authorize() and prepareLeagues() log the Settings name', () => {
  const { authorize, logs } = load({ leagues: { familie: { name: 'Familie', pin: 'pin-secret-1', settings: [['name', 'Slekta']] } } });
  authorize();
  assert.match(logs.join('\n'), /League: familie Slekta/);
  const prepare = load({ prepared: false, leagues: { familie: { name: 'Familie', settings: [['name', 'Slekta']] } } });
  prepare.prepareLeagues();
  assert.match(prepare.logs.join('\n'), /League familie \| Slekta \|/);
});

test('privacy: GET never carries an address, the Settings tab as a whole, or any key but the name', () => {
  const settings = [['name', 'Hjemme'], ['secret', 'topsecret'], ['email', 'x@example.com'], ['theme', 'dark']];
  const { get } = load({ settings, leagues: { familie: { name: 'Familie', settings } } });
  for (const body of [get(), get('familie')]) {
    const text = JSON.stringify(body);
    assert.equal(body.ok, true);
    assert.ok(!text.includes('@'), 'no address');
    for (const leak of ['topsecret', 'secret', 'theme', 'dark', 'settings', 'Settings']) assert.ok(!text.includes(leak), `leaks ${leak}`);
    assert.deepEqual(Object.keys(body.data), ['league', 'players', 'nights', 'matches', 'games']);
    assert.deepEqual(Object.keys(body.data.league), ['id', 'name', 'main']);
    assert.equal(body.data.league.name, 'Hjemme');
  }
});

test('setLeagueName: trims, applies, and the next GET shows it; the same name is a noop', () => {
  const { request, get, spreadsheets, writes } = load();
  assert.deepEqual({ ...request('setLeagueName', { name: '  Stua  ' }, PIN) }, { ok: true, result: 'applied', data: { name: 'Stua' } });
  assert.equal(get().data.league.name, 'Stua');
  assert.equal(spreadsheets.sheet.sheets.Settings.rows[1][1], 'Stua');
  const rows = JSON.stringify(spreadsheets.sheet.sheets.Settings.rows);
  assert.deepEqual({ ...request('setLeagueName', { name: 'Stua' }, PIN) }, { ok: true, result: 'noop', data: { name: 'Stua' } });
  assert.deepEqual({ ...request('setLeagueName', { name: ' Stua ' }, PIN) }, { ok: true, result: 'noop', data: { name: 'Stua' } });
  assert.equal(JSON.stringify(spreadsheets.sheet.sheets.Settings.rows), rows, 'a noop writes nothing');
  assert.equal(request('setLeagueName', { name: 'x'.repeat(40) }, PIN).result, 'applied', '40 characters is fine');
  assert.equal(request('setLeagueName', { name: '😀'.repeat(40) }, PIN).result, 'applied', 'characters, not UTF-16 units');
  assert.deepEqual(writes, []);
});

test('setLeagueName: the effective name already equal (the registered default, Settings blank) is a noop', () => {
  const { request, spreadsheets } = load({ leagues: { familie: { name: 'Familie', pin: '9999', settings: [['name', '']] } } });
  assert.equal(request('setLeagueName', { name: 'Familie' }, '9999', 'familie').result, 'noop');
  assert.deepEqual(settingsOf(spreadsheets['sheet-familie'].sheets.Settings), [['name', '']], 'the blank row stays as it was');
});

test('setLeagueName: invalid names are refused and nothing is written', () => {
  const { request, spreadsheets } = load();
  const before = JSON.stringify(spreadsheets.sheet.sheets.Settings.rows);
  const bad = ['', '   ', 'x'.repeat(41), '😀'.repeat(41), 'To\nlinjer', 'Tab\tbed', 'Nul\u0000l', 'Sep\u2028arator', 5, null, undefined, {}, ['a'], true];
  for (const name of bad) {
    assert.deepEqual({ ...request('setLeagueName', { name }, PIN) }, { ok: false, error: 'invalid', message: 'Invalid name' }, JSON.stringify(name));
  }
  assert.equal(request('setLeagueName', {}, PIN).error, 'invalid');
  assert.equal(request('setLeagueName', undefined, PIN).error, 'invalid');
  assert.equal(JSON.stringify(spreadsheets.sheet.sheets.Settings.rows), before);
});

test('setLeagueName needs the league\'s PIN and writes only that league\'s sheet', () => {
  const { request, sheets, spreadsheets, get } = load({ leagues: FAMILIE });
  assert.equal(request('setLeagueName', { name: 'Slekta' }, PIN, 'familie').error, 'pin');
  assert.equal(request('setLeagueName', { name: 'Slekta' }, '9999').error, 'pin');
  assert.equal(request('setLeagueName', { name: 'Slekta' }, 'wrong', 'familie').error, 'pin');
  assert.equal(request('setLeagueName', { name: 'Slekta' }, undefined, 'familie').error, 'pin');
  const mainBefore = JSON.stringify(Object.values(sheets).map((s) => s.rows));
  assert.equal(request('setLeagueName', { name: 'Slekta' }, '9999', 'familie').result, 'applied');
  assert.equal(JSON.stringify(Object.values(sheets).map((s) => s.rows)), mainBefore, 'main is untouched');
  assert.deepEqual(settingsOf(spreadsheets['sheet-familie'].sheets.Settings), [['name', 'Slekta']]);
  assert.equal(get('familie').data.league.name, 'Slekta');
  assert.equal(get().data.league.name, 'Sjineser');
});

test('setLeagueName appends the name row when it is missing and updates a blank one in place', () => {
  const noRow = load({ settings: [['theme', 'dark']] });
  assert.equal(noRow.request('setLeagueName', { name: 'Stua' }, PIN).result, 'applied');
  assert.deepEqual(settingsOf(noRow.sheets.Settings), [['theme', 'dark'], ['name', 'Stua']]);

  const blank = load({ settings: [['name', ''], ['theme', 'dark']] });
  assert.equal(blank.request('setLeagueName', { name: 'Stua' }, PIN).result, 'applied');
  assert.deepEqual(settingsOf(blank.sheets.Settings), [['name', 'Stua'], ['theme', 'dark']]);

  const unprepared = load({ prepared: false });
  assert.equal(unprepared.request('setLeagueName', { name: 'Stua' }, PIN).result, 'applied');
  assert.deepEqual(settingsOf(unprepared.sheets.Settings), [['name', 'Stua']], 'prepared first, then renamed: one name row');
});

test('resetAllData() keeps the league name (Settings is configuration, not data)', () => {
  const { resetAllData, request, sheets } = load();
  request('setLeagueName', { name: 'Stua' }, PIN);
  resetAllData();
  assert.deepEqual(settingsOf(sheets.Settings), [['name', 'Stua']]);
});

// ---------- Backup and restore ----------

const SRC_PLAYERS = [['Mari', true, 'mari@example.com'], ['Ola', true, ''], ['Pia', false, 'pia@example.com'], ['Per', 'TRUE', ' per@example.com ']];
const SRC_NIGHTS = [
  ['2026-11-10', 'Mari, Ola, Pia, Per', 'Pia', '2026-11-11T08:00:00.000Z'],
  ['2026-11-03', 'Mari, Ola, Per', '', ''],
];
const SRC_MATCHES = [
  ['2026-11-10#1', '2026-11-10', 'Mari', 'Ola', '', 'Pia', 'Per', ''],
  ['2026-11-10#2', '2026-11-10', 'Mari', 'Per', '', 'Ola', 'Pia', ''],
];
const SRC_GAMES = [
  ['2026-11-10#1', 1, 'A', '2026-11-10T19:00:00.000Z'],
  ['2026-11-10#1', 2, 'B', '2026-11-10T19:10:00.000Z'],
  ['2026-11-10#2', 1, 'D', '2026-11-10T19:20:00.000Z'],
];
/** A league with data (src, PIN pin-src), an empty one (dest, PIN pin-dest, its own name in Settings) and main. */
const BACKUP_LEAGUES = {
  src: { name: 'Kilde', players: SRC_PLAYERS, nights: SRC_NIGHTS, matches: SRC_MATCHES, games: SRC_GAMES },
  dest: { name: 'Mål', players: [], nights: [], settings: [['name', 'Min liga']] },
};
const DATA_TABS = ['Players', 'Nights', 'Matches', 'Games'];
const WIDTH = { Players: 3, Nights: 4, Matches: 8, Games: 4 };
/** The data rows of a tab (header and blank padding left out) as the cells that were written. */
const dataRows = (sheet, width) => sheet.rows.slice(1).filter((r) => r[0] !== undefined && r[0] !== '').map((r) => r.slice(0, width));
const snapshot = (sheets) => JSON.stringify(Object.values(sheets).map((s) => s.rows));
const exportOf = (ctx, league = 'src') => ctx.request('exportData', {}, `pin-${league}`, league);
const clone = (value) => JSON.parse(JSON.stringify(value));
const restore = (ctx, backup, league = 'dest') => ctx.request('restoreData', { backup }, `pin-${league}`, league);
const backupLoad = (extra = {}) => load({ leagues: BACKUP_LEAGUES, ...extra });

test('exportData: the whole league as one document, email included, effective name, exportedAt now', () => {
  const ctx = load({ leagues: { src: { ...BACKUP_LEAGUES.src, settings: [['name', 'Slekta']] } } });
  const before = Date.now();
  const body = exportOf(ctx);
  assert.equal(body.ok, true);
  assert.equal(body.result, 'noop');
  const backup = body.data;
  assert.deepEqual(Object.keys(backup), ['format', 'version', 'exportedAt', 'league', 'players', 'nights', 'matches', 'games']);
  assert.equal(backup.format, 'sjineser-backup');
  assert.equal(backup.version, 1);
  assert.match(backup.exportedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.ok(Date.parse(backup.exportedAt) >= before - 1000 && Date.parse(backup.exportedAt) <= Date.now() + 1000);
  assert.deepEqual(backup.league, { id: 'src', name: 'Slekta' }, 'the Settings name, not the registered one');
  assert.deepEqual(backup.players, [
    { name: 'Mari', active: true, email: 'mari@example.com' }, { name: 'Ola', active: true, email: '' },
    { name: 'Pia', active: false, email: 'pia@example.com' }, { name: 'Per', active: true, email: 'per@example.com' },
  ]);
  assert.deepEqual(backup.nights, [
    { date: '2026-11-10', players: ['Mari', 'Ola', 'Pia', 'Per'], left: ['Pia'], summarySent: '2026-11-11T08:00:00.000Z' },
    { date: '2026-11-03', players: ['Mari', 'Ola', 'Per'], left: [], summarySent: '' },
  ]);
  assert.deepEqual(backup.matches[0], { matchId: '2026-11-10#1', date: '2026-11-10', A1: 'Mari', A2: 'Ola', A3: '', B1: 'Pia', B2: 'Per', B3: '' });
  assert.deepEqual(backup.games[1], { matchId: '2026-11-10#1', gameNo: 2, result: 'B', timestamp: '2026-11-10T19:10:00.000Z' });
  assert.equal(backup.matches.length, 2);
  assert.equal(backup.games.length, 3);
  const main = ctx.request('exportData', undefined, PIN).data;
  assert.deepEqual(main.league, { id: 'main', name: 'Sjineser' });
  assert.equal(main.players.length, 6);
  assert.equal(main.players[0].email, 'fredrik@example.com');
});

test('exportData reads only: no sheet or property changes, and just the one POST lock', () => {
  const ctx = backupLoad();
  const before = snapshot(ctx.spreadsheets['sheet-src'].sheets);
  exportOf(ctx);
  assert.equal(snapshot(ctx.spreadsheets['sheet-src'].sheets), before);
  assert.equal(ctx.lock.tries, 1);
  assert.equal(ctx.lock.releases, 1);
  assert.deepEqual(ctx.writes, []);
});

test('exportData needs the league\'s PIN; a refused call carries no data, and GET still has no addresses', () => {
  const ctx = backupLoad();
  for (const [pin, league] of [['nope', 'src'], [undefined, 'src'], [PIN, 'src'], ['pin-dest', 'src'], ['pin-src', undefined], [PIN, 'nobody']]) {
    const body = ctx.request('exportData', {}, pin, league);
    assert.equal(body.ok, false, `${pin} ${league}`);
    assert.ok(['pin', 'invalid'].includes(body.error));
    assert.ok(!JSON.stringify(body).includes('@'));
  }
  assert.ok(!JSON.stringify(ctx.get('src')).includes('@'), 'GET still has no addresses');
});

test('exportData of one league never carries another league\'s data', () => {
  const ctx = backupLoad();
  const src = JSON.stringify(exportOf(ctx));
  assert.ok(!src.includes('Fredrik') && !src.includes('fredrik@') && !src.includes('Min liga'));
  const main = JSON.stringify(ctx.request('exportData', {}, PIN).data);
  assert.ok(!main.includes('Mari') && !main.includes('mari@') && !main.includes('2026-11-10#1'));
  const dest = exportOf(ctx, 'dest').data;
  assert.deepEqual(dest, { ...dest, players: [], nights: [], matches: [], games: [], league: { id: 'dest', name: 'Min liga' } });
});

test('buildBackup: copies only the listed fields, and shares no arrays with its input', () => {
  const { buildBackup } = load();
  const data = {
    players: [{ name: 'Mari', active: true, email: 'm@example.com', secret: 'x' }],
    nights: [{ date: '2026-11-10', players: ['Mari'], left: [], summarySent: '', extra: 1 }],
    matches: [{ matchId: '2026-11-10#1', date: '2026-11-10', A1: 'Mari', A2: 'Ola', A3: '', B1: 'Pia', B2: 'Per', B3: '', status: 'x' }],
    games: [{ matchId: '2026-11-10#1', gameNo: 1, result: 'A', timestamp: 't', extra: 1 }],
  };
  const backup = JSON.parse(JSON.stringify(buildBackup({ id: 'src', name: 'Kilde', main: false, pin: 'p' }, data, '2026-11-11T00:00:00.000Z')));
  assert.deepEqual(backup, {
    format: 'sjineser-backup', version: 1, exportedAt: '2026-11-11T00:00:00.000Z', league: { id: 'src', name: 'Kilde' },
    players: [{ name: 'Mari', active: true, email: 'm@example.com' }],
    nights: [{ date: '2026-11-10', players: ['Mari'], left: [], summarySent: '' }],
    matches: [{ matchId: '2026-11-10#1', date: '2026-11-10', A1: 'Mari', A2: 'Ola', A3: '', B1: 'Pia', B2: 'Per', B3: '' }],
    games: [{ matchId: '2026-11-10#1', gameNo: 1, result: 'A', timestamp: 't' }],
  });
  assert.notEqual(buildBackup({ id: 'a', name: 'b' }, data, 'x').nights[0].players, data.nights[0].players);
});

test('restoreData round trip: league A\'s export into an empty league B gives B the same data, dates and ids as text', () => {
  const ctx = backupLoad();
  const src = ctx.spreadsheets['sheet-src'].sheets;
  const dest = ctx.spreadsheets['sheet-dest'].sheets;
  const backup = exportOf(ctx).data;
  const body = restore(ctx, backup);
  assert.deepEqual(body, { ok: true, result: 'applied', data: { players: 4, nights: 2, matches: 2, games: 3 } });
  for (const name of DATA_TABS) {
    const expected = dataRows(src[name], WIDTH[name]);
    if (name === 'Players') expected.forEach((row) => { row[1] = row[1] === true || row[1] === 'TRUE'; row[2] = row[2].trim(); });
    assert.deepEqual(dataRows(dest[name], WIDTH[name]), expected, name);
  }
  assert.deepEqual(dataRows(dest.Players, 3).map((r) => r[1]), [true, true, false, true], 'real booleans');
  for (const row of dataRows(dest.Nights, 4)) assert.ok(row.every((c) => typeof c === 'string'), 'Nights are all text');
  for (const row of dataRows(dest.Matches, 8)) assert.ok(row.every((c) => typeof c === 'string'), 'Matches are all text');
  for (const row of dataRows(dest.Games, 4)) assert.deepEqual(row.map((c) => typeof c), ['string', 'number', 'string', 'string']);
  assert.equal(dest.Nights.rows[1][1], 'Mari, Ola, Pia, Per', 'comma-joined like writeRoster');
  assert.equal(dest.Nights.rows[1][2], 'Pia');
  assert.deepEqual(settingsOf(dest.Settings), [['name', 'Min liga']], 'the new league keeps its own name');
  assert.equal(ctx.get('dest').data.league.name, 'Min liga');
  // And the restored league exports the same document again (but for the time and the identity).
  const again = exportOf(ctx, 'dest').data;
  assert.deepEqual({ ...again, exportedAt: '', league: null }, { ...backup, exportedAt: '', league: null });
  assert.equal(ctx.lock.tries, 3, 'one POST lock per call');
  assert.equal(ctx.lock.releases, 3);
});

test('restoreData: the other leagues are untouched, and a second restore is refused as a conflict', () => {
  const ctx = backupLoad();
  const backup = exportOf(ctx).data;
  const mainBefore = snapshot(ctx.sheets);
  const srcBefore = snapshot(ctx.spreadsheets['sheet-src'].sheets);
  assert.equal(restore(ctx, backup).result, 'applied');
  const dest = snapshot(ctx.spreadsheets['sheet-dest'].sheets);
  assert.deepEqual({ ...restore(ctx, backup) }, { ok: false, error: 'conflict', message: 'League is not empty' });
  assert.equal(snapshot(ctx.spreadsheets['sheet-dest'].sheets), dest, 'the second call writes nothing');
  assert.equal(snapshot(ctx.sheets), mainBefore);
  assert.equal(snapshot(ctx.spreadsheets['sheet-src'].sheets), srcBefore);
  assert.equal(restore(ctx, backup, 'src').error, 'conflict', 'a league with data is never overwritten');
});

test('restoreData is refused when ANY of Players, Nights, Matches or Games has a row, and writes nothing', () => {
  const stray = {
    Players: ['Zed', true, ''], Nights: ['2026-01-01', 'Zed', '', ''],
    Matches: ['2026-01-01#1', '2026-01-01', 'a', 'b', '', 'c', 'd', ''], Games: ['x#1', 1, 'A', 't'],
  };
  const backup = exportOf(backupLoad()).data;
  for (const name of DATA_TABS) {
    const ctx = backupLoad();
    const dest = ctx.spreadsheets['sheet-dest'].sheets;
    dest[name].rows.push([...stray[name]]);
    const before = snapshot(dest);
    assert.deepEqual({ ...restore(ctx, backup) }, { ok: false, error: 'conflict', message: 'League is not empty' }, name);
    assert.equal(snapshot(dest), before, `${name}: nothing written`);
  }
  // The check comes first: even garbage reports the conflict, never touching the sheet.
  const ctx = backupLoad();
  ctx.spreadsheets['sheet-dest'].sheets.Games.rows.push([...stray.Games]);
  assert.equal(restore(ctx, 'garbage').error, 'conflict');
});

test('restoreData ignores the Settings tab when it asks whether the league is empty', () => {
  const ctx = backupLoad();
  ctx.spreadsheets['sheet-dest'].sheets.Settings.rows.push(['theme', 'dark']);
  assert.equal(restore(ctx, exportOf(ctx).data).result, 'applied');
});

test('restoreData needs the league\'s PIN and writes nothing without it', () => {
  const ctx = backupLoad();
  const backup = exportOf(ctx).data;
  const before = snapshot(ctx.spreadsheets['sheet-dest'].sheets);
  for (const pin of ['nope', undefined, '', PIN, 'pin-src']) {
    assert.equal(ctx.request('restoreData', { backup }, pin, 'dest').error, 'pin', String(pin));
  }
  assert.equal(ctx.request('restoreData', { backup }, 'pin-dest').error, 'pin', 'without the league the main PIN is needed');
  assert.equal(snapshot(ctx.spreadsheets['sheet-dest'].sheets), before);
  assert.equal(ctx.lock.tries, 1, 'only the export took the lock');
});

test('restoreData applies the normal write rules: names and emails are trimmed, a bad email is blanked, seats are trimmed', () => {
  const ctx = backupLoad();
  const backup = clone(exportOf(ctx).data);
  backup.players[0].name = '  Mari ';
  backup.players[0].email = 'not-an-address';
  backup.players[1].email = null;
  backup.nights[0].players = [' Mari', 'Ola ', 'Pia', 'Per'];
  backup.matches[0].A1 = ' Mari ';
  delete backup.matches[0].A3;
  delete backup.matches[1].B3;
  assert.equal(restore(ctx, backup).result, 'applied');
  const dest = ctx.spreadsheets['sheet-dest'].sheets;
  assert.deepEqual(dataRows(dest.Players, 3).slice(0, 2), [['Mari', true, ''], ['Ola', true, '']]);
  assert.equal(dest.Nights.rows[1][1], 'Mari, Ola, Pia, Per');
  assert.deepEqual(dataRows(dest.Matches, 8)[0], ['2026-11-10#1', '2026-11-10', 'Mari', 'Ola', '', 'Pia', 'Per', '']);
  assert.equal(dataRows(dest.Matches, 8)[1][7], '');
});

test('restoreData into a sheet with too few rows adds rows first (one setValues for the tab)', () => {
  const ctx = backupLoad();
  const backup = clone(exportOf(ctx).data);
  backup.players = Array.from({ length: 300 }, (_, i) => ({ name: `P${i}`, active: true, email: '' }));
  backup.nights = []; backup.matches = []; backup.games = [];
  let setValues = 0;
  const players = ctx.spreadsheets['sheet-dest'].sheets.Players;
  const getRange = players.getRange;
  players.getRange = (...args) => {
    const range = getRange(...args);
    const original = range.setValues;
    range.setValues = (values) => { setValues += 1; return original(values); };
    return range;
  };
  assert.deepEqual({ ...restore(ctx, backup).data }, { players: 300, nights: 0, matches: 0, games: 0 });
  assert.equal(setValues, 1);
  assert.equal(dataRows(players, 3).length, 300);
});

test('restoreData: a failure half way clears what was written, so the league is empty again and can be retried', () => {
  const ctx = backupLoad();
  const backup = exportOf(ctx).data;
  const dest = ctx.spreadsheets['sheet-dest'].sheets;
  const getRange = dest.Games.getRange;
  dest.Games.getRange = (...args) => {
    const range = getRange(...args);
    range.setValues = () => { throw new Error('Service error'); };
    return range;
  };
  const body = restore(ctx, backup);
  assert.deepEqual({ ...body }, { ok: false, error: 'server', message: 'Service error' });
  for (const name of DATA_TABS) assert.deepEqual(dataRows(dest[name], WIDTH[name]), [], name);
  assert.equal(ctx.lock.tries, ctx.lock.releases, 'the lock is released');
  dest.Games.getRange = getRange;
  assert.equal(restore(ctx, backup).result, 'applied', 'a retry works');
});

/** A valid backup from the fixture league, to break one rule at a time. */
const validBackup = () => clone(exportOf(backupLoad()).data);

/** [what, change(backup), expected message] */
const BAD_BACKUPS = [
  ['not an object: null', () => null, 'Not a Sjineser backup'],
  ['not an object: string', () => 'backup', 'Not a Sjineser backup'],
  ['not an object: number', () => 5, 'Not a Sjineser backup'],
  ['not an object: array', () => [], 'Not a Sjineser backup'],
  ['not an object: true', () => true, 'Not a Sjineser backup'],
  ['empty object', () => ({}), 'Not a Sjineser backup'],
  ['wrong format', (b) => ({ ...b, format: 'other' }), 'Not a Sjineser backup'],
  ['no format', (b) => ({ ...b, format: undefined }), 'Not a Sjineser backup'],
  ['version 2', (b) => ({ ...b, version: 2 }), 'Unsupported backup version'],
  ['version 0', (b) => ({ ...b, version: 0 }), 'Unsupported backup version'],
  ['version as text', (b) => ({ ...b, version: '1' }), 'Unsupported backup version'],
  ['no version', (b) => ({ ...b, version: undefined }), 'Unsupported backup version'],
  ['players missing', (b) => ({ ...b, players: undefined }), 'Invalid player'],
  ['players null', (b) => ({ ...b, players: null }), 'Invalid player'],
  ['players an object', (b) => ({ ...b, players: {} }), 'Invalid player'],
  ['players a string', (b) => ({ ...b, players: 'Mari' }), 'Invalid player'],
  ['nights null', (b) => ({ ...b, nights: null }), 'Invalid night'],
  ['matches a number', (b) => ({ ...b, matches: 7 }), 'Invalid match'],
  ['games null', (b) => ({ ...b, games: null }), 'Invalid game'],
  ['player null', (b) => { b.players[0] = null; return b; }, 'Invalid player'],
  ['player a string', (b) => { b.players[0] = 'Mari'; return b; }, 'Invalid player'],
  ['player an array', (b) => { b.players[0] = ['Mari', true, '']; return b; }, 'Invalid player'],
  ['player name missing', (b) => { delete b.players[0].name; return b; }, 'Invalid player'],
  ['player name blank', (b) => { b.players[0].name = '  '; return b; }, 'Invalid player'],
  ['player name a number', (b) => { b.players[0].name = 5; return b; }, 'Invalid player'],
  ['player name with a comma', (b) => { b.players[0].name = 'Ma,ri'; return b; }, 'Invalid player'],
  ['player name with a plus', (b) => { b.players[0].name = 'Ma+ri'; return b; }, 'Invalid player'],
  ['player name twice', (b) => { b.players[1].name = 'Mari'; return b; }, 'Invalid player'],
  ['player name twice, other case', (b) => { b.players[1].name = ' mARI '; return b; }, 'Invalid player'],
  ['player active as text', (b) => { b.players[0].active = 'TRUE'; return b; }, 'Invalid player'],
  ['player active missing', (b) => { delete b.players[0].active; return b; }, 'Invalid player'],
  ['player email a number', (b) => { b.players[0].email = 5; return b; }, 'Invalid player'],
  ['player email an object', (b) => { b.players[0].email = {}; return b; }, 'Invalid player'],
  ['night null', (b) => { b.nights[0] = null; return b; }, 'Invalid night'],
  ['night a string', (b) => { b.nights[0] = '2026-11-10'; return b; }, 'Invalid night'],
  ['night date missing', (b) => { delete b.nights[0].date; return b; }, 'Invalid night'],
  ['night date not ISO', (b) => { b.nights[0].date = '10.11.2026'; return b; }, 'Invalid night'],
  ['night date a number', (b) => { b.nights[0].date = 20261110; return b; }, 'Invalid night'],
  ['night date twice', (b) => { b.nights[1].date = b.nights[0].date; return b; }, 'Invalid night'],
  ['night players not a list', (b) => { b.nights[0].players = 'Mari, Ola'; return b; }, 'Invalid night'],
  ['night players with null', (b) => { b.nights[0].players = ['Mari', null]; return b; }, 'Invalid night'],
  ['night players with a number', (b) => { b.nights[0].players = ['Mari', 5]; return b; }, 'Invalid night'],
  ['night players duplicate', (b) => { b.nights[0].players = ['Mari', 'Mari']; return b; }, 'Invalid night'],
  ['night player unknown', (b) => { b.nights[0].players.push('Ukjent'); return b; }, 'Invalid night'],
  ['night left not on the roster', (b) => { b.nights[1].left = ['Pia']; return b; }, 'Invalid night'],
  ['night left not a list', (b) => { b.nights[0].left = null; return b; }, 'Invalid night'],
  ['night left duplicate', (b) => { b.nights[0].left = ['Pia', 'Pia']; return b; }, 'Invalid night'],
  ['night summarySent a number', (b) => { b.nights[0].summarySent = 5; return b; }, 'Invalid night'],
  ['night summarySent missing', (b) => { delete b.nights[0].summarySent; return b; }, 'Invalid night'],
  ['night summarySent not a timestamp', (b) => { b.nights[0].summarySent = 'yesterday'; return b; }, 'Invalid night'],
  ['match null', (b) => { b.matches[0] = null; return b; }, 'Invalid match'],
  ['match a string', (b) => { b.matches[0] = 'x'; return b; }, 'Invalid match'],
  ['match id missing', (b) => { delete b.matches[0].matchId; return b; }, 'Invalid match'],
  ['match id malformed', (b) => { b.matches[0].matchId = '2026-11-10-1'; return b; }, 'Invalid match'],
  ['match id with another date', (b) => { b.matches[0].date = '2026-11-11'; return b; }, 'Invalid match'],
  ['match date missing', (b) => { delete b.matches[0].date; return b; }, 'Invalid match'],
  ['match id twice', (b) => { b.matches[1].matchId = b.matches[0].matchId; return b; }, 'Invalid match'],
  ['match with a seat missing', (b) => { b.matches[0].A2 = ''; return b; }, 'Invalid match'],
  ['match with a player on both teams', (b) => { b.matches[0].B1 = 'Mari'; return b; }, 'Invalid match'],
  ['match with a player twice in a team', (b) => { b.matches[1].A3 = 'Mari'; return b; }, 'Invalid match'],
  ['match seat a number', (b) => { b.matches[0].A1 = 5; return b; }, 'Invalid match'],
  ['match seat null in a required seat', (b) => { b.matches[0].B1 = null; return b; }, 'Invalid match'],
  ['match seat an unknown player', (b) => { b.matches[0].A3 = 'Ukjent'; return b; }, 'Invalid match'],
  ['game null', (b) => { b.games[0] = null; return b; }, 'Invalid game'],
  ['game a string', (b) => { b.games[0] = 'x'; return b; }, 'Invalid game'],
  ['game match unknown', (b) => { b.games[0].matchId = '2026-11-10#9'; return b; }, 'Invalid game'],
  ['game match missing', (b) => { delete b.games[0].matchId; return b; }, 'Invalid game'],
  ['game number 0', (b) => { b.games[0].gameNo = 0; return b; }, 'Invalid game'],
  ['game number negative', (b) => { b.games[0].gameNo = -1; return b; }, 'Invalid game'],
  ['game number fractional', (b) => { b.games[0].gameNo = 1.5; return b; }, 'Invalid game'],
  ['game number as text', (b) => { b.games[0].gameNo = '1'; return b; }, 'Invalid game'],
  ['game number twice in a match', (b) => { b.games[1].gameNo = 1; return b; }, 'Invalid game'],
  ['game result unknown', (b) => { b.games[0].result = 'C'; return b; }, 'Invalid game'],
  ['game result lowercase', (b) => { b.games[0].result = 'a'; return b; }, 'Invalid game'],
  ['game timestamp missing', (b) => { delete b.games[0].timestamp; return b; }, 'Invalid game'],
  ['game timestamp a number', (b) => { b.games[0].timestamp = 1; return b; }, 'Invalid game'],
  ['game timestamp very long', (b) => { b.games[0].timestamp = 't'.repeat(1000); return b; }, 'Invalid game'],
  ['too many players', (b) => { b.players = Array(501).fill(null); return b; }, 'Too many rows'],
  ['too many nights', (b) => { b.nights = Array(2001).fill(null); return b; }, 'Too many rows'],
  ['too many matches', (b) => { b.matches = Array(10001).fill(null); return b; }, 'Too many rows'],
  ['too many games', (b) => { b.games = Array(60001).fill(null); return b; }, 'Too many rows'],
];

test('validateBackup accepts a real export and says nothing; the fixture really is valid', () => {
  const { validateBackup } = load();
  assert.equal(validateBackup(validBackup()), null);
  assert.equal(validateBackup({ ...validBackup(), exportedAt: 5, league: 'x', extra: 1 }), null, 'league and exportedAt are informational');
});

test('validateBackup: every rule has a negative, and never throws', () => {
  const { validateBackup } = load();
  for (const [what, change, message] of BAD_BACKUPS) {
    assert.equal(validateBackup(change(validBackup())), message, what);
  }
  for (const garbage of [undefined, null, 0, '', 'x', true, [], [[]], () => 1, Symbol('x'), NaN]) {
    assert.doesNotThrow(() => validateBackup(garbage));
    assert.equal(validateBackup(garbage), 'Not a Sjineser backup');
  }
});

test('validateBackup: the caps are inclusive (500 / 2000 / 10000 / 60000 rows are fine, one more is not)', () => {
  const { validateBackup } = load();
  const players = Array.from({ length: 500 }, (_, i) => ({ name: `P${i}`, active: true, email: '' }));
  const nights = Array.from({ length: 2000 }, (_, i) => ({
    date: new Date(Date.UTC(2000, 0, 1 + i)).toISOString().slice(0, 10), players: ['P0', 'P1'], left: [], summarySent: '',
  }));
  const matches = Array.from({ length: 10000 }, (_, i) => ({
    matchId: `2026-01-01#${i + 1}`, date: '2026-01-01', A1: 'P0', A2: 'P1', A3: '', B1: 'P2', B2: 'P3', B3: '',
  }));
  const games = Array.from({ length: 60000 }, (_, i) => ({
    matchId: `2026-01-01#${(i % 10000) + 1}`, gameNo: Math.floor(i / 10000) + 1, result: 'A', timestamp: '2026-01-01T00:00:00.000Z',
  }));
  const big = { format: 'sjineser-backup', version: 1, players, nights, matches, games };
  assert.equal(validateBackup(big), null);
  assert.equal(validateBackup({ ...big, players: [...players, { name: 'Extra', active: true, email: '' }] }), 'Too many rows');
  assert.equal(validateBackup({ ...big, games: [...games, { ...games[0], gameNo: 7 }] }), 'Too many rows');
});

test('restoreData: every invalid backup is refused with its reason and NOTHING is written', () => {
  const ctx = backupLoad();
  const dest = ctx.spreadsheets['sheet-dest'].sheets;
  const before = snapshot(dest);
  for (const [what, change, message] of BAD_BACKUPS) {
    const body = restore(ctx, change(validBackup()));
    assert.deepEqual({ ...body }, { ok: false, error: 'invalid', message }, what);
  }
  for (const payload of [undefined, null, 'x', 5, true, [], {}, { backup: null }, { backup: 'x' }, { backups: validBackup() }]) {
    const body = ctx.request('restoreData', payload, 'pin-dest', 'dest');
    assert.equal(body.ok, false, JSON.stringify(payload));
    assert.equal(body.error, 'invalid');
    assert.equal(body.message, 'Not a Sjineser backup');
  }
  assert.equal(snapshot(dest), before, 'not a single cell changed');
  assert.deepEqual(ctx.writes, []);
  assert.equal(ctx.lock.tries, ctx.lock.releases);
  assert.equal(restore(ctx, validBackup()).result, 'applied', 'and the league is still empty enough to restore');
});

test('restoreData is a POST handler only: GET has no way to reach it', () => {
  const ctx = backupLoad();
  const before = snapshot(ctx.spreadsheets['sheet-dest'].sheets);
  const body = ctx.doGet({ parameter: { l: 'dest', action: 'restoreData', backup: JSON.stringify(validBackup()) } });
  assert.equal(body.ok, true);
  assert.deepEqual(body.data.players, []);
  assert.equal(snapshot(ctx.spreadsheets['sheet-dest'].sheets), before);
});

// ---------- Backup email ----------

/** The file names of a message's attachments (as an array of this realm: the fake mail lives in the script's). */
const attachmentNames = (message) => Array.from(message.attachments, (a) => a.name);
const attachmentOf = (message, id) => {
  const blob = message.attachments.find((a) => a.name.startsWith(`sjineser-${id}-`));
  return blob && { ...blob, backup: JSON.parse(blob.data) };
};

test('sendBackups: ONE email to the owner with one JSON attachment per league, main first, counts in a Norwegian body', () => {
  const ctx = backupLoad();
  ctx.sendBackups();
  assert.equal(ctx.sent.length, 1, 'one email in all');
  const [message] = ctx.sent;
  assert.deepEqual(Object.keys(message).sort(), ['attachments', 'body', 'subject', 'to'], 'no cc, no bcc, nothing else');
  assert.equal(message.to, OWNER);
  assert.equal(message.subject, 'Sjineser sikkerhetskopi 2026-11-11');
  assert.deepEqual(attachmentNames(message), [
    'sjineser-main-2026-11-11.json', 'sjineser-src-2026-11-11.json', 'sjineser-dest-2026-11-11.json',
  ]);
  for (const blob of message.attachments) assert.equal(blob.type, 'application/json');
  assert.ok(message.attachments[0].data.includes('\n  "format"'), 'pretty-printed with two spaces');
  const src = attachmentOf(message, 'src').backup;
  assert.deepEqual(src.league, { id: 'src', name: 'Kilde' });
  assert.equal(src.players[0].email, 'mari@example.com', 'the attachment is the real backup, emails and all');
  assert.equal(src.games.length, 3);
  assert.deepEqual(attachmentOf(message, 'main').backup.league, { id: 'main', name: 'Sjineser' });
  assert.deepEqual(attachmentOf(message, 'dest').backup.league, { id: 'dest', name: 'Min liga' });
  assert.match(message.body, /Sjineser \(main\): 6 spillere, 1 kvelder, 0 sett, 0 spill/);
  assert.match(message.body, /Kilde \(src\): 4 spillere, 2 kvelder, 2 sett, 3 spill/);
  assert.match(message.body, /Min liga \(dest\): 0 spillere, 0 kvelder, 0 sett, 0 spill/);
  assert.ok(message.body.indexOf('(main)') < message.body.indexOf('(src)'));
  assert.ok(!message.body.includes('@'), 'no addresses in the body');
  for (const secret of [PIN, 'pin-src', 'pin-dest', 'sheet-src', 'sheet-dest']) {
    assert.ok(!message.body.includes(secret), `no secret in the body: ${secret}`);
  }
  assert.equal(ctx.lock.tries, ctx.lock.releases);
  assert.equal(ctx.lock.tries, 3, 'each league is read under the lock');
});

test('sendBackups: a broken league is listed as failed and the others are still sent; nothing throws or leaks', () => {
  const ctx = load({
    leagues: {
      ...BACKUP_LEAGUES,
      broken: { registration: 'not json' },
      gone: { name: 'Borte', registration: JSON.stringify({ name: 'Borte', sheetId: 'sheet-missing', pin: 'pin-secret-9' }) },
      leaky: { name: 'Lekk', pin: 'pin-secret-8' },
    },
    props: { LEAGUE_Typo: JSON.stringify({ sheetId: 'sheet', pin: 'p' }) },
  });
  ctx.spreadsheets['sheet-leaky'].getSheetByName = () => { throw new Error('Cannot open sheet-leaky with pin-secret-8'); };
  assert.doesNotThrow(() => ctx.sendBackups());
  assert.equal(ctx.sent.length, 1);
  const [message] = ctx.sent;
  assert.deepEqual(attachmentNames(message), [
    'sjineser-main-2026-11-11.json', 'sjineser-src-2026-11-11.json', 'sjineser-dest-2026-11-11.json',
  ]);
  assert.match(message.body, /- broken: feilet: Unknown league/);
  assert.match(message.body, /- gone: feilet: No item with the given ID could be found/);
  assert.match(message.body, /- leaky: feilet: Cannot open … with …/, 'a quoted sheet id or PIN is scrubbed');
  assert.match(message.body, /- Typo: feilet: Unknown league/);
  assert.match(message.body, /Kilde \(src\): 4 spillere/);
  const everything = message.body + ctx.logs.join('\n');
  for (const secret of ['pin-secret', 'sheet-missing', 'sheet-leaky', PIN]) assert.ok(!everything.includes(secret), secret);
  assert.equal(ctx.lock.tries, ctx.lock.releases, 'no lock is left taken');
});

test('sendBackups: a league that is busy is listed as failed, the rest is sent', () => {
  const ctx = backupLoad();
  let tries = 0;
  ctx.lock.onTry = () => { tries += 1; ctx.lock.fail = tries === 2; };
  ctx.sendBackups();
  assert.match(ctx.sent[0].body, /- src: feilet: Busy, try again/);
  assert.deepEqual(attachmentNames(ctx.sent[0]), ['sjineser-main-2026-11-11.json', 'sjineser-dest-2026-11-11.json']);
});

test('sendBackups: when every league fails the owner still hears about it (an email without attachments)', () => {
  const ctx = load({ props: { LEAGUE_main: '{' } });
  ctx.sendBackups();
  assert.equal(ctx.sent.length, 1);
  assert.deepEqual(attachmentNames(ctx.sent[0]), []);
  assert.match(ctx.sent[0].body, /- main: feilet: Unknown league/);
});

test('sendBackups: respects the daily mail quota (needs at least one) and does nothing with no league', () => {
  const none = load({ quota: 0, leagues: BACKUP_LEAGUES });
  none.sendBackups();
  assert.deepEqual(none.sent, []);
  assert.equal(none.lock.tries, 0, 'nothing is even read');
  assert.match(none.logs.join('\n'), /quota/);
  const one = load({ quota: 1, leagues: BACKUP_LEAGUES });
  one.sendBackups();
  assert.equal(one.sent.length, 1);
  const bare = load({ props: { LEAGUE_main: null } });
  bare.sendBackups();
  assert.deepEqual(bare.sent, []);
});

test('sendBackups reads the Settings name, and does not change any sheet or property', () => {
  const ctx = load({ leagues: { src: { ...BACKUP_LEAGUES.src, settings: [['name', 'Slekta']] } } });
  const before = [snapshot(ctx.sheets), snapshot(ctx.spreadsheets['sheet-src'].sheets)];
  ctx.sendBackups();
  assert.match(ctx.sent[0].body, /Slekta \(src\)/);
  assert.deepEqual([snapshot(ctx.sheets), snapshot(ctx.spreadsheets['sheet-src'].sheets)], before);
  assert.deepEqual(ctx.writes, []);
});

// ---------- Backup trigger ----------

const MONTHLY = ['timeBased', 'onMonthDay:10', 'atHour:6', 'create'];

test('installBackupTrigger creates ONE monthly trigger (the 10th, 06:00) for sendBackups, and is idempotent', () => {
  const ctx = load({ triggers: ['other', 'sendBackups', 'sendBackups'] });
  ctx.installBackupTrigger();
  assert.deepEqual(ctx.triggers.map((t) => t.handler), ['other', 'sendBackups']);
  assert.deepEqual(ctx.triggers[1].calls, MONTHLY);
  ctx.installBackupTrigger();
  ctx.installBackupTrigger();
  assert.equal(ctx.triggers.filter((t) => t.handler === 'sendBackups').length, 1);
  assert.equal(ctx.triggers.length, 2, 'the trigger of something else is never touched');
  assert.equal(ctx.lock.tries, 0, 'lock-free');
  assert.equal(ctx.logs.length, 3, 'one log line per call');
  assert.ok(!ctx.logs.join('\n').includes(PIN));
  const fresh = load();
  fresh.installBackupTrigger();
  assert.deepEqual(fresh.triggers.map((t) => [t.handler, ...t.calls]), [['sendBackups', ...MONTHLY]]);
});

test('removeBackupTrigger deletes every sendBackups trigger and nothing else', () => {
  const ctx = load({ triggers: ['other', 'sendBackups', 'sendBackups'] });
  ctx.removeBackupTrigger();
  assert.deepEqual(ctx.triggers.map((t) => t.handler), ['other']);
  assert.match(ctx.logs.join('\n'), /removed: 2/);
  ctx.removeBackupTrigger();
  assert.match(ctx.logs.join('\n'), /removed: 0/);
  assert.equal(ctx.lock.tries, 0);
});

test('authorize() touches the triggers and says how many sendBackups triggers exist (0 = not installed)', () => {
  const none = load({ triggers: ['other'] });
  none.authorize();
  assert.match(none.logs.join('\n'), /Backup triggers \(0 = not installed\): 0/);
  const two = load({ triggers: ['sendBackups', 'other', 'sendBackups'] });
  two.authorize();
  assert.match(two.logs.join('\n'), /Backup triggers \(0 = not installed\): 2/);
});

test('the editor and timer functions are not web actions: only exportData and restoreData are new', () => {
  const ctx = backupLoad();
  for (const action of ['sendBackups', 'installBackupTrigger', 'removeBackupTrigger', 'readBackup', 'buildBackup', 'validateBackup',
    'parseBackup', 'leagueIsEmpty', 'writeRows', 'authorize', 'resetAllData', 'setup']) {
    assert.deepEqual({ ...ctx.request(action, {}, PIN) }, { ok: false, error: 'invalid', message: 'Unknown action' }, action);
    assert.equal(ctx.request(action, {}, 'wrong').error, 'pin', 'the PIN is checked first, as for any action');
  }
  assert.deepEqual(ctx.sent, []);
  assert.deepEqual(ctx.triggers, []);
  assert.equal(ctx.request('exportData', {}, PIN).ok, true);
});

test('restoreData keeps a team of three: the third seats are written', () => {
  const six = ['Ann', 'Bo', 'Cy', 'Di', 'Ed', 'Fy'];
  const ctx = backupLoad();
  const backup = {
    format: 'sjineser-backup', version: 1, exportedAt: '2026-11-11T00:00:00.000Z', league: { id: 'x', name: 'X' },
    players: six.map((name) => ({ name, active: true, email: '' })),
    nights: [],
    matches: [{ matchId: '2026-11-12#1', date: '2026-11-12', A1: 'Ann', A2: 'Bo', A3: 'Cy', B1: 'Di', B2: 'Ed', B3: 'Fy' }],
    games: [{ matchId: '2026-11-12#1', gameNo: 1, result: 'B', timestamp: '2026-11-12T20:00:00.000Z' }],
  };
  assert.equal(restore(ctx, backup).result, 'applied');
  assert.deepEqual(dataRows(ctx.spreadsheets['sheet-dest'].sheets.Matches, 8), [['2026-11-12#1', '2026-11-12', 'Ann', 'Bo', 'Cy', 'Di', 'Ed', 'Fy']]);
});
