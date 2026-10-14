import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClock } from '../../docs/js/state/clock.js';
import { createStorage } from '../../docs/js/state/storage.js';
import { memoryBackend } from '../helpers.js';

const now = () => new Date(2026, 9, 14, 21, 30);

test('without storage, today is the local date of now()', () => {
  assert.equal(createClock({ now }).today(), '2026-10-14');
  assert.equal(createClock({ now }).setToday('2027-01-01'), undefined);
  assert.equal(createClock({ now }).today(), '2026-10-14');
});

test('with storage, today falls back to now() until a date is stored', () => {
  const clock = createClock({ storage: createStorage(memoryBackend(), 'sjineser-sandbox:'), now });
  assert.equal(clock.today(), '2026-10-14');
  clock.setToday('2026-11-01');
  assert.equal(clock.today(), '2026-11-01');
});

test('setToday ignores invalid dates', () => {
  const clock = createClock({ storage: createStorage(memoryBackend()), now });
  clock.setToday('2026-11-01');
  clock.setToday('');
  clock.setToday('1. november');
  clock.setToday(null);
  assert.equal(clock.today(), '2026-11-01');
});
