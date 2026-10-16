import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatFilter, inFilter, nightFilter, parseFilter, seasonsIn } from '../../../docs/js/domain/stats/filter.js';
import { generateHistory } from '../../../docs/js/sandbox/generate.js';
import { dataset } from '../../helpers.js';

const TODAY = '2026-10-14';
const night = (date) => ({ date, players: ['Frode', 'Hans', 'Per', 'Tor'] });

test('parseFilter reads all and year-half', () => {
  assert.deepEqual(parseFilter('all', TODAY), { kind: 'all' });
  assert.deepEqual(parseFilter('2025-1', TODAY), { kind: 'season', year: 2025, half: 1 });
  assert.deepEqual(parseFilter('2026-2', TODAY), { kind: 'season', year: 2026, half: 2 });
});

test('parseFilter falls back to the season of today', () => {
  const current = { kind: 'season', year: 2026, half: 2 };
  for (const text of [undefined, null, '', 'nope', '2026-3', '2026-0', '26-1', '2026-1x', ' all']) {
    assert.deepEqual(parseFilter(text, TODAY), current, String(text));
  }
  assert.deepEqual(parseFilter(undefined, '2027-03-01'), { kind: 'season', year: 2027, half: 1 });
});

test('formatFilter and parseFilter round-trip', () => {
  for (const text of ['all', '2025-1', '2026-2']) assert.equal(formatFilter(parseFilter(text, TODAY)), text);
});

test('inFilter keeps everything for all and only the season otherwise', () => {
  assert.equal(inFilter('1999-01-01', { kind: 'all' }), true);
  const autumn = { kind: 'season', year: 2026, half: 2 };
  assert.equal(inFilter('2026-07-01', autumn), true);
  assert.equal(inFilter('2026-06-30', autumn), false);
  assert.equal(inFilter('2025-10-14', autumn), false);
});

test('a night filter keeps only its own date; its key is n:date and never parsed from s', () => {
  const night = nightFilter('2026-10-13');
  assert.deepEqual(night, { kind: 'night', date: '2026-10-13' });
  assert.equal(inFilter('2026-10-13', night), true);
  assert.equal(inFilter('2026-10-14', night), false);
  assert.equal(inFilter('2026-10-12', night), false);
  assert.equal(formatFilter(night), 'n:2026-10-13');
  assert.deepEqual(parseFilter('n:2026-10-13', TODAY), { kind: 'season', year: 2026, half: 2 });
});

test('seasonsIn lists distinct seasons of all nights plus the current one, newest first', () => {
  const ds = dataset({ nights: [night('2025-09-01'), night('2026-02-01'), night('2025-11-01'), night('2026-03-01')] });
  assert.deepEqual(seasonsIn(ds, TODAY), [
    { kind: 'season', year: 2026, half: 2 },
    { kind: 'season', year: 2026, half: 1 },
    { kind: 'season', year: 2025, half: 2 },
  ]);
  assert.deepEqual(seasonsIn(dataset(), TODAY), [{ kind: 'season', year: 2026, half: 2 }]);
});

test('seasonsIn does not repeat the current season', () => {
  const ds = dataset({ nights: [night('2026-08-01'), night('2026-09-01')] });
  assert.deepEqual(seasonsIn(ds, TODAY), [{ kind: 'season', year: 2026, half: 2 }]);
});

test('seasonsIn covers the generated history', () => {
  const { dataset: ds, nextDate } = generateHistory();
  const seasons = seasonsIn(ds, nextDate).map(formatFilter);
  assert.deepEqual(seasons, ['2026-2', '2026-1', '2025-2']);
});
