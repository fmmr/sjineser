import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chartDateFormat, formatValue } from '../../../docs/js/views/stats/widgets/format.js';
import { formatDate, formatDateLong } from '../../../docs/js/i18n/nb.js';

// Intl nb-NO uses a no-break space (U+00A0) for grouping and before '%', and U+2212 for minus.
const NBSP = ' ';

test('int: grouped whole numbers', () => {
  assert.equal(formatValue(7, 'int'), '7');
  assert.equal(formatValue(12345, 'int'), `12${NBSP}345`);
});

test('percent: 0–1 shown with 0 decimals', () => {
  assert.equal(formatValue(0.456, 'percent'), `46${NBSP}%`);
  assert.equal(formatValue(1, 'percent'), `100${NBSP}%`);
  assert.equal(formatValue(0, 'percent'), `0${NBSP}%`);
});

test('rating: rounded, never grouped', () => {
  assert.equal(formatValue(1012.6, 'rating'), '1013');
  assert.equal(formatValue(987.2, 'rating'), '987');
});

test('signed: rounded with + or −, zero without sign', () => {
  assert.equal(formatValue(12.6, 'signed'), '+13');
  assert.equal(formatValue(-12.4, 'signed'), '−12');
  assert.equal(formatValue(0.2, 'signed'), '0');
});

test('signedPercent: a fraction shown as signed percentage points, zero without sign', () => {
  assert.equal(formatValue(0.083, 'signedPercent'), '+8');
  assert.equal(formatValue(-0.126, 'signedPercent'), '−13');
  assert.equal(formatValue(-0.004, 'signedPercent'), '0');
});

test('decimal: one decimal with a comma', () => {
  assert.equal(formatValue(2.25, 'decimal'), '2,3');
  assert.equal(formatValue(3, 'decimal'), '3,0');
});

test('unknown formats fall back to the plain number', () => {
  assert.equal(formatValue(5, 'nope'), '5');
});

test('chart dates are short within one calendar year and long across years', () => {
  assert.equal(chartDateFormat(['2026-01-05', '2026-12-30']), formatDate);
  assert.equal(chartDateFormat(['2025-12-30', '2026-01-05']), formatDateLong);
  assert.equal(chartDateFormat([]), formatDate);
});

test('formatDateLong includes the year', () => {
  assert.equal(formatDateLong('2025-10-14'), '14. okt. 2025');
  assert.equal(formatDate('2025-10-14'), '14. okt.');
});
