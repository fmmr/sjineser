import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inSeason, seasonOf } from '../../docs/js/domain/season.js';

test('seasons are half-years: January–June and July–December', () => {
  assert.deepEqual(seasonOf('2026-01-01'), { year: 2026, half: 1 });
  assert.deepEqual(seasonOf('2026-06-30'), { year: 2026, half: 1 });
  assert.deepEqual(seasonOf('2026-07-01'), { year: 2026, half: 2 });
  assert.deepEqual(seasonOf('2026-12-31'), { year: 2026, half: 2 });
});

test('inSeason compares year and half', () => {
  const autumn = seasonOf('2026-10-14');
  assert.equal(inSeason('2026-08-01', autumn), true);
  assert.equal(inSeason('2026-05-01', autumn), false);
  assert.equal(inSeason('2025-10-14', autumn), false);
});
