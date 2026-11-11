import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SOURCE = readFileSync(new URL('../../apps-script/Code.js', import.meta.url), 'utf8');
const OWNER = 'owner@example.com';
const PIN = '1234';
const NIGHT = '2026-11-10';

/** A sheet of rows (header first) with the slice of the Range API Code.js uses. */
function fakeSheet(rows) {
  return {
    rows,
    getMaxRows: () => rows.length,
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
        setNumberFormat: () => range,
      };
      return range;
    },
  };
}

/**
 * Loads Code.js with stubbed Apps Script services. Players: active with an address (Fredrik,
 * Anne, Eva with spaces and capitals), INACTIVE with an address (Bjørn), active without one
 * (Cato) and with a broken one (Dag).
 */
function load({ quota = 100, today = '2026-11-11', sends = null, nights = [[NIGHT, 'Fredrik, Anne, Cato, Dag', '', '']],
  nightsHeader = ['date', 'players', 'left', 'summarySent'] } = {}) {
  const sheets = {
    Players: fakeSheet([
      ['name', 'active', 'email'],
      ['Fredrik', true, 'fredrik@example.com'],
      ['Anne', true, 'anne@example.com'],
      ['Bjørn', false, 'bjorn@example.com'],
      ['Cato', true, ''],
      ['Dag', true, 'not-an-address'],
      ['Eva', 'TRUE', ' Eva@Example.com '],
    ]),
    Nights: fakeSheet([nightsHeader, ...nights]),
    Matches: fakeSheet([['matchId', 'date', 'A1', 'A2', 'A3', 'B1', 'B2', 'B3']]),
    Games: fakeSheet([['matchId', 'gameNo', 'result', 'timestamp']]),
  };
  const sent = [];
  const properties = { SHEET_ID: 'sheet', PIN, ...(sends ? { SUMMARY_SENDS: sends } : {}) };
  const context = vm.createContext({
    console,
    SpreadsheetApp: { openById: () => ({ getSheetByName: (name) => sheets[name] }) },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: (key) => properties[key] ?? null, setProperty: (key, value) => { properties[key] = value; } }),
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (text) => ({ setMimeType: () => JSON.parse(text) }) },
    MailApp: { sendEmail: (message) => sent.push(message), getRemainingDailyQuota: () => quota },
    Session: { getEffectiveUser: () => ({ getEmail: () => OWNER }), getScriptTimeZone: () => 'Europe/Oslo' },
    Utilities: { formatDate: () => today },
  });
  const api = vm.runInContext(`${SOURCE}\n;({ doGet, doPost, summaryRecipients })`, context);
  const post = (payload, pin = PIN) => api.doPost({ postData: { contents: JSON.stringify({ action: 'sendNightSummary', payload, pin }) } });
  return { ...api, post, sent, sheets, properties };
}

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
  assert.deepEqual({ ...post(MAIL) }, { ok: true, result: 'applied', data: { recipients: 3 } });
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
  assert.deepEqual({ ...post({ ...MAIL, testPlayer: 'fredrik' }) }, { ok: true, result: 'applied', data: { recipients: 1 } });
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

test('ensureHeaders: an older Nights tab gets the summarySent header by itself, without setup()', () => {
  const { doGet, sheets } = load({ nightsHeader: ['date', 'players', 'left'], nights: [[NIGHT, 'Fredrik, Anne, Cato, Dag', '']] });
  const body = doGet();
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
