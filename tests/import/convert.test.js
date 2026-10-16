import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOps, convert, foldOps, gameTimestamp, inferMatches, parseCsv, parseLogg, parsePlayers,
} from '../../scripts/import/convert.mjs';
import { parseApiUrl } from '../../scripts/import-history.mjs';

const HEADER = 'Dato,Sett-ID,Game,Lag A - Spiller 1,Lag A - Spiller 2,Lag A - Spiller 3,Lag B - Spiller 1,Lag B - Spiller 2,Lag B - Spiller 3,Poeng Lag A,Poeng Lag B';
const POINTS = { A: '1.0,0.0', B: '0.0,1.0', D: '0.0,0.0' };
/** A logg line: date dd.mm.yyyy, teams of 2–3, result. */
const line = (date, A, B, result) =>
  [date, '', '', ...[0, 1, 2].map((i) => A[i] ?? ''), ...[0, 1, 2].map((i) => B[i] ?? ''), POINTS[result]].join(',');
const logg = (...lines) => [HEADER, ...lines].join('\r\n') + '\r\n';
const games = (...lines) => parseLogg(parseCsv(logg(...lines)));

const D1 = '01.02.2025';
const D2 = '02.02.2025';
const AB = ['Ada', 'Bo'];
const CD = ['Cy', 'Di'];
const AC = ['Ada', 'Cy'];
const BD = ['Bo', 'Di'];
const results = (match) => match.games.map((g) => g.result).join('');

test('parseCsv handles quotes, embedded commas, doubled quotes, CRLF, BOM and empty cells', () => {
  const text = '﻿a,b,c\r\n"x, y","say ""hi""",\r\n1,"multi\nline",3\n';
  assert.deepEqual(parseCsv(text), [['a', 'b', 'c'], ['x, y', 'say "hi"', ''], ['1', 'multi\nline', '3']]);
  assert.deepEqual(parseCsv('a,b'), [['a', 'b']]);
  assert.throws(() => parseCsv('"open'), /unterminated/);
});

test('parseLogg reads dates, teams of 2–3 and the three point patterns', () => {
  const parsed = games(line(D1, AB, ['Cy', 'Di', 'Eli'], 'A'), line(D1, AB, ['Cy', 'Di', 'Eli'], 'B'), '', line(D1, AB, CD, 'D'));
  assert.deepEqual(parsed.map((g) => [g.date, g.A, g.B, g.result, g.row]), [
    ['2025-02-01', AB, ['Cy', 'Di', 'Eli'], 'A', 2],
    ['2025-02-01', AB, ['Cy', 'Di', 'Eli'], 'B', 3],
    ['2025-02-01', AB, CD, 'D', 5],
  ]);
});

test('parseLogg reports every bad row with its row number', () => {
  const bad = [
    line('2025-02-01', AB, CD, 'A'),
    line('31.02.2025', AB, CD, 'A'),
    line(D1, ['Ada'], CD, 'A'),
    line(D1, ['Ada', 'ada'], CD, 'A'),
    line(D1, AB, ['Bo', 'Cy'], 'A'),
    line(D1, AB, CD, 'A').replace('1.0,0.0', '1.0,1.0'),
    line(D1, ['Ada', 'Bo', 'Cy'], ['Di', 'Eli', 'Fia'], 'A'),
  ];
  let message = '';
  try { games(...bad); } catch (err) { message = err.message; }
  assert.match(message, /6 invalid row/);
  assert.match(message, /row 2: date "2025-02-01"/);
  assert.match(message, /row 3: date "31.02.2025"/);
  assert.match(message, /row 4: team A has 1 players/);
  assert.match(message, /row 5: team A repeats a player/);
  assert.match(message, /row 6: on both teams: Bo/);
  assert.match(message, /row 7: points "1.0\/1.0"/);
  assert.doesNotMatch(message, /row 8/);
  assert.throws(() => parseLogg([['Dato']]), /Missing column/);
});

test('parsePlayers reads the Navn column and skips blanks', () => {
  assert.deepEqual(parsePlayers(parseCsv('Navn\nAda\n\n Bo \n')), ['Ada', 'Bo']);
});

test('inferMatches: same teams roll over into a new match once a team has 3 wins', () => {
  const matches = inferMatches(games(
    ...['A', 'D', 'A', 'B', 'A'].map((r) => line(D1, AB, CD, r)),
    ...['B', 'B'].map((r) => line(D1, AB, CD, r)),
  ));
  assert.equal(matches.length, 2);
  assert.equal(results(matches[0]), 'ADABA');
  assert.equal(results(matches[1]), 'BB');
});

test('inferMatches: a team change starts a new match, even before 3 wins (abandoned match)', () => {
  const matches = inferMatches(games(line(D1, AB, CD, 'A'), line(D1, AB, CD, 'B'), line(D1, AC, BD, 'A')));
  assert.deepEqual(matches.map((m) => [m.A, m.B, results(m)]), [[AB, CD, 'AB'], [AC, BD, 'A']]);
});

test('inferMatches: same teams with sides swapped stay in the match, results swapped', () => {
  const matches = inferMatches(games(
    line(D1, AB, CD, 'A'),
    line(D1, ['Di', 'Cy'], ['Bo', 'Ada'], 'A'),
    line(D1, CD, AB, 'D'),
    line(D1, ['Bo', 'Ada'], CD, 'A'),
  ));
  assert.equal(matches.length, 1);
  assert.deepEqual([matches[0].A, matches[0].B], [AB, CD]);
  assert.equal(results(matches[0]), 'ABDA');
  assert.ok(matches[0].games.every((g) => g.A === matches[0].A && g.B === matches[0].B));
});

test('inferMatches: a new date always starts a new match', () => {
  const matches = inferMatches(games(line(D1, AB, CD, 'A'), line(D2, AB, CD, 'A'), line(D2, AB, CD, 'A')));
  assert.deepEqual(matches.map((m) => [m.date, results(m)]), [['2025-02-01', 'A'], ['2025-02-02', 'AA']]);
});

test('buildOps: players first, then night, matches numbered per night, games numbered per match', () => {
  const matches = inferMatches(games(
    ...['A', 'A', 'A'].map((r) => line(D1, AB, CD, r)),
    line(D1, AC, BD, 'D'),
    line(D2, ['Eli', 'Bo'], CD, 'B'),
  ));
  const ops = buildOps(['Bo', 'Ada', 'Cy', 'Di', 'Zed'], matches);
  assert.deepEqual(ops.slice(0, 6).map((o) => [o.action, o.payload.name]), [
    ['addPlayer', 'Bo'], ['addPlayer', 'Ada'], ['addPlayer', 'Cy'], ['addPlayer', 'Di'], ['addPlayer', 'Zed'], ['addPlayer', 'Eli'],
  ]);
  const rest = ops.slice(6).map((o) => [o.action, o.payload.matchId ?? o.payload.date, o.payload.gameNo ?? '']);
  assert.deepEqual(rest, [
    ['startNight', '2025-02-01', ''],
    ['startMatch', '2025-02-01#1', ''],
    ['addGame', '2025-02-01#1', 1], ['addGame', '2025-02-01#1', 2], ['addGame', '2025-02-01#1', 3],
    ['startMatch', '2025-02-01#2', ''],
    ['addGame', '2025-02-01#2', 1],
    ['startNight', '2025-02-02', ''],
    ['startMatch', '2025-02-02#1', ''],
    ['addGame', '2025-02-02#1', 1],
  ]);
  assert.deepEqual(ops[6].payload.players, ['Ada', 'Bo', 'Cy', 'Di']);
  assert.deepEqual(ops[7].payload, { matchId: '2025-02-01#1', date: '2025-02-01', A1: 'Ada', A2: 'Bo', A3: '', B1: 'Cy', B2: 'Di', B3: '' });
  const stamps = ops.filter((o) => o.action === 'addGame' && o.payload.matchId.startsWith('2025-02-01')).map((o) => o.payload.timestamp);
  assert.deepEqual(stamps, ['2025-02-01T20:00:00Z', '2025-02-01T20:01:00Z', '2025-02-01T20:02:00Z', '2025-02-01T20:03:00Z']);
  const ds = foldOps(ops);
  assert.equal(ds.players.length, 6);
  assert.equal(ds.games.length, 5);
});

test('buildOps: 3 vs 2 matches fill the third seat; names in games take the listed casing', () => {
  const matches = inferMatches(games(
    line(D1, ['Ada', 'Bo', 'Eli'], CD, 'A'),
    line(D1, ['eli', 'Ada', 'Bo'], CD, 'B'),
    line(D1, ['Ada', 'Bo', 'Eli'], ['Cy', 'Di', 'Fia'], 'D'),
  ));
  assert.equal(matches.length, 2);
  const ops = buildOps(['Ada', 'Bo', 'Cy', 'Di', 'Eli'], matches);
  const starts = ops.filter((o) => o.action === 'startMatch').map((o) => o.payload);
  assert.deepEqual(starts.map(({ A1, A2, A3, B1, B2, B3 }) => [A1, A2, A3, B1, B2, B3]), [
    ['Ada', 'Bo', 'Eli', 'Cy', 'Di', ''],
    ['Ada', 'Bo', 'Eli', 'Cy', 'Di', 'Fia'],
  ]);
  const ds = foldOps(ops);
  assert.deepEqual(ds.nights[0].players, ['Ada', 'Bo', 'Cy', 'Di', 'Eli', 'Fia']);
  assert.deepEqual(ds.games.map((g) => g.result), ['A', 'B', 'D']);
});

test('foldOps throws with the op and outcome when an op does not apply', () => {
  const ops = [{ action: 'addPlayer', payload: { name: 'Ada' } }, { action: 'addPlayer', payload: { name: 'ada' } }];
  assert.throws(() => foldOps(ops), /Op 2 \(addPlayer\) was noop/);
});

test('gameTimestamp stays valid past 59 minutes', () => {
  assert.equal(gameTimestamp('2025-02-01', 75), '2025-02-01T21:15:00Z');
});

test('convert runs the whole pipeline from file texts', () => {
  const { dataset, ops } = convert({
    logg: logg(line(D1, AB, CD, 'A'), line(D1, CD, AB, 'B')),
    spillere: 'Navn\nAda\nBo\nCy\nDi\nNeverPlayed\n',
  });
  assert.equal(dataset.players.length, 5);
  assert.equal(dataset.matches.length, 1);
  assert.deepEqual(dataset.games.map((g) => g.result), ['A', 'A']);
  assert.equal(ops.length, 5 + 1 + 1 + 2);
});

test('parseApiUrl reads the constant from config.js source', () => {
  assert.equal(parseApiUrl("export const API_URL = 'https://example.test/exec';\n"), 'https://example.test/exec');
  assert.throws(() => parseApiUrl("export const API_URL = '';"), /API_URL/);
});
