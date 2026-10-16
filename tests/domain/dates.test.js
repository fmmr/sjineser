import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, isISODate, toISODate } from '../../docs/js/domain/dates.js';

test('toISODate uses local date with zero padding', () => {
  assert.equal(toISODate(new Date(2026, 0, 5, 23, 30)), '2026-01-05');
});

test('isISODate accepts only YYYY-MM-DD', () => {
  assert.equal(isISODate('2026-10-14'), true);
  assert.equal(isISODate('14.10.2026'), false);
  assert.equal(isISODate(''), false);
});

test('addDays steps calendar days across month, year and DST boundaries', () => {
  assert.equal(addDays('2026-10-14', 1), '2026-10-15');
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-10-25', 1), '2026-10-26');
  assert.equal(addDays('2027-03-28', -1), '2027-03-27');
  assert.equal(addDays('2026-10-14', 14), '2026-10-28');
});
