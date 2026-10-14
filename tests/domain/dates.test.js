import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isISODate, toISODate } from '../../docs/js/domain/dates.js';

test('toISODate uses local date with zero padding', () => {
  assert.equal(toISODate(new Date(2026, 0, 5, 23, 30)), '2026-01-05');
});

test('isISODate accepts only YYYY-MM-DD', () => {
  assert.equal(isISODate('2026-10-14'), true);
  assert.equal(isISODate('14.10.2026'), false);
  assert.equal(isISODate(''), false);
});
