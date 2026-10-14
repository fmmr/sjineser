import { test } from 'node:test';
import assert from 'node:assert/strict';
import { datasetSummary } from '../../docs/js/domain/summary.js';
import { DATE, dataset, game, nightWithMatch } from '../helpers.js';

test('datasetSummary of an empty dataset is all zero, without dates', () => {
  assert.deepEqual(datasetSummary(dataset()), { players: 0, nights: 0, matches: 0, games: 0, firstDate: null, latestDate: null });
});

test('datasetSummary counts only nights and matches with games', () => {
  const base = nightWithMatch(['A', 'D', 'B']);
  const ds = {
    ...base,
    nights: [{ date: '2026-09-01', players: [] }, ...base.nights, { date: '2026-10-21', players: [] }],
    matches: [
      { ...base.matches[0], matchId: '2026-09-01#1', date: '2026-09-01' },
      ...base.matches,
      { ...base.matches[0], matchId: `${DATE}#2` },
      { ...base.matches[0], matchId: '2026-10-21#1', date: '2026-10-21' },
    ],
    games: [game('2026-09-01#1', 1, 'A'), ...base.games],
  };
  assert.deepEqual(datasetSummary(ds), { players: 4, nights: 2, matches: 2, games: 4, firstDate: '2026-09-01', latestDate: DATE });
});
