import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changedSides } from '../../../docs/js/views/play/match.js';

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
