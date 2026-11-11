import { test } from 'node:test';
import assert from 'node:assert/strict';
import { factsFor } from '../../../docs/js/views/stats/facts-cache.js';
import { generateHistory } from '../../../docs/js/sandbox/generate.js';
import { history } from '../../domain/stats/catalog/fixtures.js';

const { dataset } = generateHistory();

test('facts are reused while the dataset and the filter stay the same', () => {
  const first = factsFor(dataset, { kind: 'all' });
  assert.equal(factsFor(dataset, { kind: 'all' }), first);
});

test('facts are rebuilt when the filter or the dataset identity changes', () => {
  const all = factsFor(dataset, { kind: 'all' });
  const season = factsFor(dataset, { kind: 'season', year: 2026, half: 1 });
  assert.notEqual(season, all);
  assert.deepEqual(season.filter, { kind: 'season', year: 2026, half: 1 });
  const copy = structuredClone(dataset);
  assert.notEqual(factsFor(copy, { kind: 'season', year: 2026, half: 1 }), season);
});

test('facts take the clock: no penalty for the ongoing night; rebuilt when the clock moves on', () => {
  const ds = history([
    { date: '2026-09-02', matches: [['Hans Frode - Tor Per', 'D']] },
    { date: '2026-09-16', matches: [['Hans Frode - Tor Ola', 'D']] },
  ]);
  const during = factsFor(ds, { kind: 'all' }, { today: '2026-09-16', hour: 21 });
  assert.deepEqual(during.penalties, []);
  const after = factsFor(ds, { kind: 'all' }, { today: '2026-09-17', hour: 12 });
  assert.notEqual(after, during);
  assert.deepEqual(after.penalties.map((p) => p.player), ['Per']);
});
