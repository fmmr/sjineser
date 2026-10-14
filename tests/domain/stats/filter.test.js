import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultFilter, formatFilter, inFilter, parseFilter, seasonsIn } from '../../../docs/js/domain/stats/filter.js';
import { generateHistory } from '../../../docs/js/sandbox/generate.js';
import { dataset, game } from '../../helpers.js';

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

/** A dataset with one match per date; dates in `played` get a game. */
function withMatches(dates, played = dates) {
  const matches = dates.map((date) => ({ matchId: `${date}#1`, date, A1: 'Frode', A2: 'Hans', B1: 'Per', B2: 'Tor' }));
  return dataset({
    nights: dates.map(night),
    matches,
    games: matches.filter((m) => played.includes(m.date)).map((m) => game(m.matchId, 1, 'A')),
  });
}

test('defaultFilter is the current season when it has games', () => {
  const ds = withMatches(['2026-03-01', '2026-09-01']);
  assert.deepEqual(defaultFilter(ds, TODAY), { kind: 'season', year: 2026, half: 2 });
});

test('defaultFilter falls back to the latest season with games', () => {
  const ds = withMatches(['2025-09-01', '2026-03-01', '2026-10-01'], ['2025-09-01', '2026-03-01']);
  assert.deepEqual(defaultFilter(ds, TODAY), { kind: 'season', year: 2026, half: 1 });
});

test('defaultFilter is all when there are no games at all', () => {
  assert.deepEqual(defaultFilter(dataset(), TODAY), { kind: 'all' });
  assert.deepEqual(defaultFilter(withMatches(['2026-10-01'], []), TODAY), { kind: 'all' });
});
