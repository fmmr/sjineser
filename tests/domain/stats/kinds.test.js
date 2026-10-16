import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, NUMBER_FORMATS, TABLE_FORMATS, isValidValue } from '../../../docs/js/domain/stats/kinds.js';

const valid = (kind, value) => assert.equal(isValidValue(kind, value), true, JSON.stringify(value));
const invalid = (kind, value) => assert.equal(isValidValue(kind, value), false, JSON.stringify(value));

test('known kinds and formats', () => {
  assert.deepEqual(KINDS, ['number', 'wdl', 'duel', 'table', 'record', 'chart', 'form', 'sets']);
  assert.deepEqual(NUMBER_FORMATS, ['int', 'percent', 'rating', 'signed', 'decimal', 'signedPercent']);
  assert.deepEqual(TABLE_FORMATS, [...NUMBER_FORMATS, 'player', 'pair', 'label', 'date', 'players', 'form', 'countShare']);
});

test('unknown kinds and null are never valid', () => {
  invalid('pie', { value: 1, format: 'int' });
  for (const kind of KINDS) invalid(kind, null);
});

test('duel', () => {
  valid('duel', { left: { name: 'Anne', wins: 32 }, right: { name: 'Erik', wins: 12 }, draws: 24 });
  valid('duel', { left: { name: 'Anne', wins: 0 }, right: { name: 'Erik', wins: 0 }, draws: 1 });
  invalid('duel', { left: { name: 'Anne', wins: 1 }, draws: 0 });
  invalid('duel', { left: { name: '', wins: 1 }, right: { name: 'Erik', wins: 1 }, draws: 0 });
  invalid('duel', { left: { name: 'Anne', wins: -1 }, right: { name: 'Erik', wins: 1 }, draws: 0 });
  invalid('duel', { left: { name: 'Anne', wins: 1 }, right: { name: 'Erik', wins: 1 }, draws: 0.5 });
});

test('number', () => {
  valid('number', { value: 3, format: 'int' });
  valid('number', { value: 0.25, format: 'percent' });
  valid('number', { value: 1012.4, format: 'rating', marker: 'provisional' });
  valid('number', { value: -12.5, format: 'signed' });
  valid('number', { value: 2.5, format: 'decimal' });
  valid('number', { value: -0.083, format: 'signedPercent' });
  valid('number', { value: 1, format: 'signedPercent' });
  invalid('number', { value: 1.5, format: 'signedPercent' });
  invalid('number', { value: -1.01, format: 'signedPercent' });
  invalid('number', { value: 2.5, format: 'int' });
  invalid('number', { value: 1.2, format: 'percent' });
  invalid('number', { value: NaN, format: 'decimal' });
  invalid('number', { value: '3', format: 'int' });
  invalid('number', { value: 3, format: 'player' });
  invalid('number', { value: 3, format: 'int', marker: 'new' });
});

test('wdl', () => {
  valid('wdl', { W: 3, D: 0, L: 1 });
  invalid('wdl', { W: 3, L: 1 });
  invalid('wdl', { W: -1, D: 0, L: 1 });
  invalid('wdl', { W: 1.5, D: 0, L: 1 });
});

test('table', () => {
  const columns = [{ key: 'player', format: 'player' }, { key: 'pair', format: 'pair' }, { key: 'kind', format: 'label' },
    { key: 'games', format: 'int' }, { key: 'winRate', format: 'percent' }];
  const row = { player: 'Anne', pair: ['Anne', 'Bjørn'], kind: 'streak_win', games: 4, winRate: 0.5 };
  valid('table', { columns, rows: [] });
  valid('table', { columns, rows: [row, { ...row, subject: { type: 'player', name: 'Anne' }, provisional: true }] });
  invalid('table', { columns: [], rows: [] });
  invalid('table', { columns: [{ key: 'x', format: 'colour' }], rows: [] });
  invalid('table', { columns: [{ key: 'x', format: 'int' }, { key: 'x', format: 'int' }], rows: [] });
  invalid('table', { columns, rows: [{ ...row, games: 1.5 }] });
  invalid('table', { columns, rows: [{ ...row, player: '' }] });
  invalid('table', { columns, rows: [{ ...row, pair: ['Anne'] }] });
  invalid('table', { columns, rows: [{ ...row, kind: 3 }] });
  invalid('table', { columns, rows: [{ ...row, subject: { type: 'team' } }] });
  invalid('table', { columns, rows: null });
});

test('table date and players cells', () => {
  const columns = [{ key: 'date', format: 'date' }, { key: 'players', format: 'players' }];
  const row = { date: '2026-10-14', players: ['Anne', 'Bjørn'] };
  valid('table', { columns, rows: [row] });
  invalid('table', { columns, rows: [{ ...row, date: '14.10.2026' }] });
  invalid('table', { columns, rows: [{ ...row, date: null }] });
  invalid('table', { columns, rows: [{ ...row, players: [] }] });
  invalid('table', { columns, rows: [{ ...row, players: ['Anne', ''] }] });
  invalid('table', { columns, rows: [{ ...row, players: 'Anne' }] });
});

test('record', () => {
  valid('record', { value: 7, format: 'int', holders: [] });
  valid('record', { value: 0.8, format: 'percent', holders: ['Anne'], date: '2026-10-14', matchId: '2026-10-14#2' });
  invalid('record', { value: 7, format: 'int' });
  invalid('record', { value: 7, format: 'int', holders: [3] });
  invalid('record', { value: 7, format: 'int', holders: [], date: '14.10.2026' });
  invalid('record', { value: 7, format: 'int', holders: [], matchId: 'x' });
  invalid('record', { value: 7, format: 'pair', holders: [] });
});

test('chart', () => {
  valid('chart', { series: [{ name: 'Anne', points: [{ x: '2026-10-14', y: 1012.5 }] }] });
  valid('chart', { series: [{ name: 'Anne', points: [] }, { name: 'Bjørn', points: [{ x: '2026-10-14', y: 990 }] }] });
  invalid('chart', { series: [] });
  invalid('chart', { series: [{ name: 'Anne', points: [{ x: 'today', y: 1 }] }] });
  invalid('chart', { series: [{ name: 'Anne', points: [{ x: '2026-10-14', y: null }] }] });
  invalid('chart', { series: [{ points: [] }] });
});

test('table rows may carry an optional boolean provisional flag', () => {
  const columns = [{ key: 'player', format: 'player' }, { key: 'rating', format: 'rating' }];
  const row = { player: 'Anne', rating: 1012 };
  valid('table', { columns, rows: [{ ...row, provisional: false }, { ...row, provisional: true }, row] });
  invalid('table', { columns, rows: [{ ...row, provisional: 'yes' }] });
  invalid('table', { columns, rows: [{ ...row, provisional: 1 }] });
});

test('form: 1–10 outcomes, oldest first', () => {
  valid('form', { outcomes: ['W'] });
  valid('form', { outcomes: ['W', 'D', 'L', 'W', 'W', 'L', 'D', 'D', 'W', 'L'] });
  invalid('form', { outcomes: [] });
  invalid('form', { outcomes: Array(11).fill('W') });
  invalid('form', { outcomes: ['W', 'X'] });
  invalid('form', { outcomes: 'WDL' });
  invalid('form', {});
});

test('table form cells: 0–10 outcomes; [] means no games in the period', () => {
  const columns = [{ key: 'player', format: 'player' }, { key: 'form', format: 'form' }];
  valid('table', { columns, rows: [{ player: 'Anne', form: ['W', 'D', 'L'] }, { player: 'Bjørn', form: [] }] });
  invalid('table', { columns, rows: [{ player: 'Anne', form: null }] });
  invalid('table', { columns, rows: [{ player: 'Anne', form: ['S'] }] });
  invalid('table', { columns, rows: [{ player: 'Anne', form: Array(11).fill('L') }] });
});

test('sets: a list of sets in play order, each with teams, score, winner and complete', () => {
  const set = { matchId: '2026-10-13#1', number: 1, A: ['Anne', 'Bjørn'], B: ['Cato', 'Dag', 'Erik'],
    score: { A: 3, B: 1, D: 2 }, winner: 'A', complete: true };
  const open = { ...set, matchId: '2026-10-13#2', number: 2, score: { A: 1, B: 0, D: 0 }, winner: null, complete: false };
  valid('sets', { sets: [set, open] });
  invalid('sets', { sets: [] });
  invalid('sets', {});
  invalid('sets', { sets: [{ ...set, matchId: 'x' }] });
  invalid('sets', { sets: [{ ...set, number: 0 }] });
  invalid('sets', { sets: [{ ...set, A: [] }] });
  invalid('sets', { sets: [{ ...set, score: { A: 3, B: 1 } }] });
  invalid('sets', { sets: [{ ...set, winner: 'D' }] });
  invalid('sets', { sets: [{ ...set, complete: false }] });
  invalid('sets', { sets: [{ ...open, complete: true }] });
});
