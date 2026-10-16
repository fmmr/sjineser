import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cellText, rowLinkKey, signOf } from '../../../docs/js/views/stats/widgets/table.js';

test('table cells: date with the year, players as a name list', () => {
  assert.equal(cellText('2025-10-14', 'date'), '14. okt. 2025');
  assert.equal(cellText(['Anne'], 'players'), 'Anne');
  assert.equal(cellText(['Anne', 'Bjørn', 'Cato'], 'players'), 'Anne, Bjørn og Cato');
});

test('table cells: pairs, labels, numbers and empty number cells', () => {
  assert.equal(cellText(['Anne', 'Bjørn'], 'pair'), 'Anne & Bjørn');
  assert.equal(cellText('streak_win', 'label'), 'Seire');
  assert.equal(cellText(12.6, 'signed'), '+13');
  assert.equal(cellText(null, 'int'), '–');
});

test('table cells: form as S/U/T letters, oldest first; – without games', () => {
  assert.equal(cellText(['W', 'D', 'L', 'W'], 'form'), 'SUTS');
  assert.equal(cellText([], 'form'), '–');
});

test('sign colour follows the shown, rounded value', () => {
  assert.equal(signOf(12.6, 'signed'), 'up');
  assert.equal(signOf(-0.4, 'signed'), null);
  assert.equal(signOf(-0.083, 'signedPercent'), 'down');
  assert.equal(signOf(-0.004, 'signedPercent'), null);
  assert.equal(signOf(null, 'signed'), null);
  assert.equal(signOf(5, 'int'), null);
});

test('row links: a night row links from its date cell, other subjects from the first player/pair cell', () => {
  const nights = [{ key: 'date', format: 'date' }, { key: 'players', format: 'players' }, { key: 'winner', format: 'player' }];
  assert.equal(rowLinkKey(nights, { subject: { type: 'night', date: '2026-10-13' } }), 'date');
  assert.equal(rowLinkKey(nights, {}), null, 'no subject: player cells link to their own page');
  const partners = [{ key: 'partner', format: 'player' }, { key: 'games', format: 'int' }];
  assert.equal(rowLinkKey(partners, { subject: { type: 'pair', names: ['Anne', 'Bjørn'] } }), 'partner');
  assert.equal(rowLinkKey([{ key: 'games', format: 'int' }], { subject: { type: 'night', date: '2026-10-13' } }), null);
});
