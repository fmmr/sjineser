import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SOURCE = readFileSync(new URL('../../apps-script/Code.js', import.meta.url), 'utf8');
const OWNER = 'owner@example.com';
const PIN = '1234';
const NIGHT = '2026-11-10';

/** A sheet of rows (header first) with the slice of the Range/Sheet API Code.js uses. `log` records formatting calls. */
function fakeSheet(rows) {
  const log = [];
  return {
    rows,
    log,
    getMaxRows: () => rows.length,
    setFrozenRows: () => { log.push('setFrozenRows'); },
    insertRowsAfter: (after, count) => { for (let i = 0; i < count; i += 1) rows.push([]); },
    getRange: (row, column, count = 1, width = 1) => {
      const range = {
        getValues: () => rows.slice(row - 1, row - 1 + count)
          .map((cells) => Array.from({ length: width }, (_, i) => cells[column - 1 + i] ?? '')),
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

function standardSheets({ players = MAIN_PLAYERS, nights, nightsHeader = ['date', 'players', 'left', 'summarySent'] } = {}) {
  const roster = players.map((p) => p[0]).join(', ');
  return {
    Players: fakeSheet([['name', 'active', 'email'], ...players.map((p) => [...p])]),
    Nights: fakeSheet([nightsHeader, ...(nights ?? [[NIGHT, roster, '', '']])]),
    Matches: fakeSheet([['matchId', 'date', 'A1', 'A2', 'A3', 'B1', 'B2', 'B3']]),
    Games: fakeSheet([['matchId', 'gameNo', 'result', 'timestamp']]),
  };
}

/**
 * Loads Code.js with stubbed Apps Script services. Main league players: active with an address
 * (Fredrik, Anne, Eva with spaces and capitals), INACTIVE with an address (Bjørn), active without
 * one (Cato) and with a broken one (Dag).
 * `leagues` registers more leagues: { id: { name, pin, players, title, registration } } (each gets
 * its own fake spreadsheet 'sheet-<id>'; `registration` replaces the LEAGUE_<id> value).
 * `prepared: false` leaves every schema version unset, so the first request prepares the sheet.
 */
function load({ quota = 100, today = '2026-11-11', sends = null, nights, nightsHeader, omitTabs = [], leagues = {},
  prepared = true, props = {}, mainTitle = 'Fotballkveld', renameFails = false } = {}) {
  const sheets = standardSheets({ nights, nightsHeader });
  omitTabs.forEach((name) => delete sheets[name]);
  const spreadsheets = { sheet: fakeSpreadsheet(sheets, mainTitle, { renameFails }) };
  const properties = { SHEET_ID: 'sheet', PIN, ...(prepared ? { SCHEMA_main: '1' } : {}), ...(sends ? { SUMMARY_SENDS: sends } : {}), ...props };
  Object.entries(leagues).forEach(([id, league]) => {
    spreadsheets[`sheet-${id}`] = fakeSpreadsheet(standardSheets({ players: league.players ?? LEAGUE_PLAYERS }), league.title ?? 'Liga');
    properties[`LEAGUE_${id}`] = league.registration
      ?? JSON.stringify({ name: league.name ?? id, sheetId: `sheet-${id}`, pin: league.pin ?? `pin-${id}` });
    if (prepared) properties[`SCHEMA_${id}`] = '1';
  });
  const sent = [];
  const reads = [];
  const writes = [];
  const logs = [];
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
    Session: { getEffectiveUser: () => ({ getEmail: () => OWNER }), getScriptTimeZone: () => 'Europe/Oslo' },
    Utilities: { formatDate: () => today },
  });
  const api = vm.runInContext(
    `${SOURCE}\n;({ doGet, doPost, summaryRecipients, countMissingEmails, setup, prepareLeagues, authorize, resetAllData })`, context);
  const request = (action, payload, pin = PIN, league) => api.doPost({
    postData: { contents: JSON.stringify({ action, payload, pin, ...(league === undefined ? {} : { league }) }) },
  });
  const post = (payload, pin = PIN, league) => request('sendNightSummary', payload, pin, league);
  const get = (league) => api.doGet(league === undefined ? undefined : { parameter: { l: league } });
  return { ...api, post, request, get, sent, sheets, spreadsheets, properties, reads, writes, logs, lock };
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
  assert.equal(load({ props: { NAME: 'Stua' } }).get().data.league.name, 'Stua');
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

test('main league without a PIN refuses every write', () => {
  const bare = load({ props: { PIN: null } });
  assert.equal(bare.request('addPlayer', { name: 'Gro' }, undefined).error, 'pin');
  assert.equal(bare.request('addPlayer', { name: 'Gro' }, '').error, 'pin');
  assert.equal(bare.request('addPlayer', { name: 'Gro' }, 'null').error, 'pin');
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

test('an unknown or malformed league is "Unknown league" and no reserved property is read', () => {
  const ctx = load({ leagues: FAMILIE });
  const bad = ['PIN', 'SHEET_ID', '../x', 'Familie', 'FAMILIE', 'ab', 'x'.repeat(41), '-abc', 'a b', 'a_b', 'LEAGUE_familie', 5, true, {}, ['familie']];
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
    noname: JSON.stringify({ ...good, name: '' }), nosheet: JSON.stringify({ ...good, sheetId: undefined }),
    numpin: JSON.stringify({ ...good, pin: 1234 }), numname: JSON.stringify({ ...good, name: 5 }),
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
  assert.equal(properties.SCHEMA_main, '1');
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
  assert.equal(properties.SCHEMA_main, '1');
  assert.equal(lock.tries, 1);
});

test('schema: each league has its own version; preparing one leaves the others alone', () => {
  const { get, properties, spreadsheets } = load({ prepared: false, leagues: FAMILIE });
  assert.equal(get('familie').ok, true);
  assert.equal(properties.SCHEMA_familie, '1');
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
  lock.onTry = () => { properties.SCHEMA_main = '1'; };
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
  assert.equal(properties.SCHEMA_main, '1');
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
  assert.equal(properties.SCHEMA_main, '1');
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
    props: { LEAGUE_Typo: JSON.stringify({ name: 'T', sheetId: 'sheet', pin: 'p' }), LEAGUE_main: JSON.stringify({ name: 'M', sheetId: 'sheet-familie', pin: 'p' }) },
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
  for (const id of ['main', 'familie', 'venner']) assert.equal(properties[`SCHEMA_${id}`], '1', id);
  for (const id of ['broken', 'gone', 'Typo']) assert.equal(properties[`SCHEMA_${id}`], undefined, id);
  assert.equal(text.includes('League main failed'), false, 'LEAGUE_main is ignored');
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
