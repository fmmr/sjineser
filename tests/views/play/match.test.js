import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changedSides, resultLabel, teamLabel } from '../../../docs/js/views/play/match.js';

const shown = (matchId, A, B) => ({ matchId, A, B });

test('changedSides names the side whose score went up or down', () => {
  assert.deepEqual(changedSides(shown('m1', 1, 0), shown('m1', 2, 0)), ['A']);
  assert.deepEqual(changedSides(shown('m1', 2, 1), shown('m1', 2, 0)), ['B']);
  assert.deepEqual(changedSides(shown('m1', 2, 1), shown('m1', 3, 2)), ['A', 'B']);
});

test('changedSides is empty when nothing changed (store polls re-render too)', () => {
  assert.deepEqual(changedSides(shown('m1', 2, 1), shown('m1', 2, 1)), []);
});

test('changedSides is empty on first render and when another match is shown', () => {
  assert.deepEqual(changedSides(null, shown('m1', 2, 1)), []);
  assert.deepEqual(changedSides(shown('m1', 3, 1), shown('m2', 0, 0)), []);
});

const seats = (A1, A2, A3, B1, B2, B3) => ({ matchId: 'm1', A1, A2, A3, B1, B2, B3 });

test('resultLabel names the winning team instead of "Lag A" / "Lag B"', () => {
  const match = seats('Fredrik', 'HP', '', 'Tom', 'Kari', '');
  assert.equal(resultLabel(match, 'A'), 'Fredrik og HP vant');
  assert.equal(resultLabel(match, 'B'), 'Tom og Kari vant');
  assert.equal(resultLabel(match, 'D'), 'Uavgjort');
});

test('resultLabel lists three players with a comma and "og"', () => {
  const match = seats('Fredrik', 'HP', 'Tom', 'Kari', 'Ola', '');
  assert.equal(resultLabel(match, 'A'), 'Fredrik, HP og Tom vant');
  assert.equal(resultLabel(match, 'B'), 'Kari og Ola vant');
});

test('teamLabel reads the team and its score naturally', () => {
  const match = seats('Fredrik', 'HP', '', 'Tom', 'Kari', '');
  assert.equal(teamLabel(match, 'A', 1), 'Fredrik og HP: 1 seier');
  assert.equal(teamLabel(match, 'B', 2), 'Tom og Kari: 2 seire');
  assert.equal(teamLabel(match, 'B', 0), 'Tom og Kari: 0 seire');
});
