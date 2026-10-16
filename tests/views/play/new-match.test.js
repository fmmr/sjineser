import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canStart, nextSide } from '../../../docs/js/views/play/new-match.js';

const counts = (A, B) => ({ A, B });

test('nextSide cycles bench → A → B → bench', () => {
  assert.equal(nextSide('bench', counts(0, 0)), 'A');
  assert.equal(nextSide('A', counts(1, 0)), 'B');
  assert.equal(nextSide('B', counts(0, 1)), 'bench');
});

test('nextSide skips full teams: up to three players per team', () => {
  assert.equal(nextSide('bench', counts(2, 2)), 'A', 'a team of two can take a third');
  assert.equal(nextSide('bench', counts(3, 2)), 'B');
  assert.equal(nextSide('bench', counts(3, 3)), 'bench');
  assert.equal(nextSide('A', counts(3, 3)), 'bench', 'B is full, so A goes straight to the bench');
  assert.equal(nextSide('A', counts(3, 2)), 'B');
});

test('canStart: both teams have 2–3 players', () => {
  assert.equal(canStart(counts(2, 2)), true);
  assert.equal(canStart(counts(3, 2)), true);
  assert.equal(canStart(counts(2, 3)), true);
  assert.equal(canStart(counts(3, 3)), true);
  assert.equal(canStart(counts(1, 2)), false);
  assert.equal(canStart(counts(3, 1)), false);
  assert.equal(canStart(counts(4, 2)), false);
});
